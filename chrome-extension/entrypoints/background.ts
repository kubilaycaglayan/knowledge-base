import "../clockify-validation.js";
import "../api-config.js";
import "../google-auth.js";
import "../clockify-settings.js";

const debug = (...args: unknown[]) => {
  if (typeof __KNOW_EXTENSION_ENV__ !== "string" || __KNOW_EXTENSION_ENV__ !== "production")
    console.warn("[Know extension]", ...args);
};
const errorDetails = (error: unknown) => error instanceof Error ? error.message : String(error || "Unknown error");
const logError = (operation: string, error: unknown, details: Record<string, unknown> = {}) =>
  debug("Operation failed", { operation, ...details, error: errorDetails(error), stack: error instanceof Error ? error.stack : undefined });
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
      chrome.storage.local.get(["token", "apiBase", KnowClockifySettings.KEY]).then(async ({ token, apiBase, [KnowClockifySettings.KEY]: clockifyImportEnabled }) => {
        if (!KnowClockifySettings.isEnabled(clockifyImportEnabled)) {
          debug("Import skipped because Clockify import is disabled");
          return sendResponse({ ok: false, disabled: true, error: "Clockify import is disabled in extension settings." });
        }
        const base = KnowApiConfig.apiBase(apiBase);
        const url = base + "/imports/clockify";
        debug("Preparing Clockify import request", {
          method: "POST", url, storedApiBase: apiBase || null,
          tokenPresent: Boolean(token), tokenLength: typeof token === "string" ? token.length : 0,
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
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(message.payload),
          });
        } catch (error) {
          logError("Clockify import request", error, { url, kind: "network-or-cors" });
          return sendResponse({ ok: false, error: "Could not reach the Know API: " + errorDetails(error) });
        }
        const responseBody = await response.text();
        debug("Clockify import response", {
          url, status: response.status, redirected: response.redirected,
          responseUrl: response.url, body: responseBody.slice(0, 1000),
          bodyTruncated: responseBody.length > 1000,
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
  const { apiBase } = await chrome.storage.local.get("apiBase");
  const base = KnowApiConfig.apiBase(apiBase);
  const { clientId } = await fetchWithTimeout(base + "/auth/google/config").then(async (response) => {
    if (!response.ok) throw Error("Google configuration request failed (HTTP " + response.status + ")");
    return response.json();
  });
  if (!clientId) throw Error("Google sign-in is not configured");
  const state = KnowGoogleAuth.nonce();
  const requestNonce = KnowGoogleAuth.nonce();
  const redirectUri = chrome.identity.getRedirectURL();
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: KnowGoogleAuth.authorizationUrl(clientId, redirectUri, state, requestNonce),
    interactive: true,
  });
  const idToken = KnowGoogleAuth.parseRedirect(redirectUrl, state, requestNonce);
  const response = await fetchWithTimeout(base + "/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw Error("Google authentication failed (HTTP " + response.status + ")");
  const result = await response.json();
  await chrome.storage.local.set({ token: result.token });
  return { ok: true, token: result.token };
}
