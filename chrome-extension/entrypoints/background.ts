import "../clockify-validation.js";
import "../api-config.js";
import "../google-auth.js";

const diagnosticSessionId = `worker-${crypto.randomUUID()}`;
const debug = (event: string, details: Record<string, unknown> = {}) =>
  console.info("[Knowledge Base extension]", event, {
    sessionId: diagnosticSessionId,
    version: chrome.runtime.getManifest().version,
    ...details,
  });
const errorDetails = (error: unknown) => error instanceof Error ? error.message : String(error || "Unknown error");
const logError = (operation: string, error: unknown, details: Record<string, unknown> = {}) =>
  console.error("[Knowledge Base extension] Operation failed", {
    sessionId: diagnosticSessionId,
    version: chrome.runtime.getManifest().version,
    operation, ...details,
    errorName: error instanceof Error ? error.name : "UnknownError",
    error: errorDetails(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export default defineBackground({
  type: "module",
  main() {
    debug("Background worker started", { environment: typeof __KNOW_EXTENSION_ENV__ === "string" ? __KNOW_EXTENSION_ENV__ : "unknown" });
    chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get("activeTimer"));
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "KNOW_OPEN_POPUP") {
        chrome.action.openPopup().catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }));
        return false;
      }
      if (message?.type === "KNOW_GOOGLE_LOGIN") {
        void googleLogin().then(sendResponse).catch((error) => {
          logError("Google sign-in", error);
          sendResponse({ ok: false, error: "Google sign-in could not be completed. Try again." });
        });
        return true;
      }
      if (message?.type !== "KNOW_CLOCKIFY_IMPORT") return false;
      if (sender.origin && sender.origin !== "https://app.clockify.me") {
        debug("Rejected message from unexpected sender origin", sender.origin);
        return false;
      }
      const validation = KnowClockifyValidation.validate(message.payload);
      if (!validation.ok) {
        logError("Validate Clockify import", Error(validation.error), { senderOrigin: sender.origin || null });
        sendResponse({ ok: false, error: validation.error });
        return false;
      }
      chrome.storage.local.get(["token", "apiBase"]).then(async ({ token, apiBase }) => {
        const base = KnowApiConfig.apiBase(apiBase);
        const url = base + "/imports/clockify";
        const requestId = `extension-${crypto.randomUUID()}`;
        const startedAt = performance.now();
        debug("Preparing Clockify import request", {
          requestId, method: "POST", url, storedApiBase: apiBase || null,
          tokenPresent: Boolean(token),
          entryCount: Array.isArray(message.payload?.timeentries) ? message.payload.timeentries.length : "invalid",
        });
        if (!token) {
          debug("Import stopped because no extension token is stored");
          return sendResponse({ ok: false, needsLogin: true, error: "Sign in through the Know extension first." });
        }
        let response: Response;
        try {
          response = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Request-ID": requestId, Authorization: `Bearer ${token}` },
            body: JSON.stringify(message.payload),
          });
        } catch (error) {
          logError("Clockify import request", error, { requestId, url, durationMs: Math.round(performance.now() - startedAt), kind: "network-or-cors" });
          return sendResponse({ ok: false, error: "Could not reach the Know API: " + errorDetails(error) });
        }
        const responseBody = await response.text();
        debug("Clockify import response", {
          requestId, serverRequestId: response.headers.get("X-Request-ID"), url,
          status: response.status, redirected: response.redirected,
          responseUrl: response.url, responseBytes: responseBody.length,
          durationMs: Math.round(performance.now() - startedAt),
        });
        if (response.redirected || new URL(response.url).origin !== new URL(base).origin)
          return sendResponse({ ok: false, error: "Know API returned an unexpected redirect." });
        if (response.status === 401) {
          logError("Clockify import authentication", Error("Session token rejected"), { url, status: response.status, responseBody });
          return sendResponse({ ok: false, needsLogin: true, error: "Know rejected this automatic import. Open the extension to verify your session." });
        }
        if (response.status === 403) {
          logError("Clockify import CORS/authorization", Error("API returned HTTP 403"), { url, status: response.status, responseBody });
          return sendResponse({ ok: false, error: "Know blocked the extension request. Add this extension ID to the API CORS origins." });
        }
        if (!response.ok) {
          logError("Clockify import response", Error("HTTP " + response.status), { url, status: response.status, responseBody });
          return sendResponse({ ok: false, error: responseBody || "Could not import Clockify data." });
        }
        try {
          sendResponse({ ok: true, summary: responseBody ? JSON.parse(responseBody) : null });
        } catch (error) {
          logError("Clockify import response parsing", error, { url, status: response.status, responseBody });
          sendResponse({ ok: false, error: "Know returned invalid JSON: " + errorDetails(error) });
        }
      }).catch((error) => {
        logError("Clockify import", error);
        sendResponse({ ok: false, error: errorDetails(error) || "Could not import Clockify data." });
      });
      return true;
    });
  },
});

async function googleLogin() {
  const flowId = `google-${crypto.randomUUID()}`;
  let stage = "resolve-api";
  const startedAt = performance.now();
  debug("Google sign-in started", { flowId, stage });
  const { apiBase } = await chrome.storage.local.get("apiBase");
  const base = KnowApiConfig.apiBase(apiBase);
  stage = "load-google-config";
  const configRequestId = `extension-${crypto.randomUUID()}`;
  const { clientId } = await fetchWithTimeout(base + "/auth/google/config", {
    headers: { "X-Request-ID": configRequestId },
  }).then(async (response) => {
    debug("Google configuration response", { flowId, stage, requestId: configRequestId, serverRequestId: response.headers.get("X-Request-ID"), status: response.status });
    if (!response.ok) throw Error("Google configuration request failed (HTTP " + response.status + ")");
    return response.json();
  });
  if (!clientId) throw Error("Google sign-in is not configured");
  const state = KnowGoogleAuth.nonce();
  const requestNonce = KnowGoogleAuth.nonce();
  const redirectUri = chrome.identity.getRedirectURL();
  stage = "google-web-auth-flow";
  debug("Opening Google authorization flow", { flowId, stage, redirectOrigin: new URL(redirectUri).origin });
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: KnowGoogleAuth.authorizationUrl(clientId, redirectUri, state, requestNonce),
    interactive: true,
  });
  debug("Google authorization redirect received", { flowId, stage, redirectOrigin: new URL(redirectUrl).origin });
  stage = "validate-google-redirect";
  const idToken = KnowGoogleAuth.parseRedirect(redirectUrl, state, requestNonce);
  debug("Google identity token parsed", { flowId, stage, tokenPresent: Boolean(idToken), tokenBytes: idToken.length });
  stage = "exchange-google-token";
  const authRequestId = `extension-${crypto.randomUUID()}`;
  const response = await fetchWithTimeout(base + "/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": authRequestId },
    body: JSON.stringify({ idToken }),
  });
  debug("Google token exchange response", {
    flowId, stage, requestId: authRequestId, serverRequestId: response.headers.get("X-Request-ID"),
    status: response.status, durationMs: Math.round(performance.now() - startedAt),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw Error("Google authentication failed (HTTP " + response.status + ", response bytes " + responseText.length + ")");
  }
  const result = await response.json();
  stage = "store-session";
  await chrome.storage.local.set({ token: result.token });
  debug("Google sign-in completed", { flowId, stage, tokenStored: Boolean(result.token), durationMs: Math.round(performance.now() - startedAt) });
  return { ok: true, token: result.token };
}
