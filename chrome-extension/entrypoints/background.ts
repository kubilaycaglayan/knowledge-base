import "../clockify-validation.js";
import "../api-config.js";

const debug = (...args: unknown[]) => {
  if (typeof __KNOW_EXTENSION_ENV__ !== "string" || __KNOW_EXTENSION_ENV__ !== "production")
    console.warn("[Know extension]", ...args);
};
const errorDetails = (error: unknown) => error instanceof Error ? error.message : String(error || "Unknown error");
const logError = (operation: string, error: unknown, details: Record<string, unknown> = {}) =>
  debug("Operation failed", { operation, ...details, error: errorDetails(error), stack: error instanceof Error ? error.stack : undefined });

export default defineBackground({
  type: "module",
  main() {
    chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get("activeTimer"));
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "KNOW_OPEN_POPUP") {
        chrome.action.openPopup().catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }));
        return false;
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
          response = await fetch(url, {
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
