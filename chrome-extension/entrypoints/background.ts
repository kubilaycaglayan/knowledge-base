import "../clockify-validation.js";
import "../api-config.js";

const debug = (...args: unknown[]) => {
  if (typeof __KNOW_EXTENSION_ENV__ !== "string" || __KNOW_EXTENSION_ENV__ !== "production")
    console.warn("[Know extension]", ...args);
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
      if (message?.type !== "KNOW_CLOCKIFY_IMPORT") return false;
      if (sender.origin && sender.origin !== "https://app.clockify.me") {
        debug("Rejected message from unexpected sender origin", sender.origin);
        return false;
      }
      const validation = KnowClockifyValidation.validate(message.payload);
      if (!validation.ok) { sendResponse({ ok: false, error: validation.error }); return false; }
      chrome.storage.local.get(["token", "apiBase"]).then(async ({ token, apiBase }) => {
        const base = KnowApiConfig.apiBase(apiBase);
        const url = base + "/imports/clockify";
        if (!token) {
          debug("Import stopped because no extension token is stored");
          return sendResponse({ ok: false, needsLogin: true, error: "Sign in through the Know extension first." });
        }
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(message.payload),
        });
        if (response.redirected || new URL(response.url).origin !== new URL(base).origin)
          return sendResponse({ ok: false, error: "Know API returned an unexpected redirect." });
        if (response.status === 401) {
          await response.text();
          return sendResponse({ ok: false, needsLogin: true, error: "Know rejected this automatic import. Open the extension to verify your session." });
        }
        if (response.status === 403) {
          await response.text();
          return sendResponse({ ok: false, error: "Know blocked the extension request. Add this extension ID to the API CORS origins." });
        }
        if (!response.ok) return sendResponse({ ok: false, error: (await response.text()) || "Could not import Clockify data." });
        sendResponse({ ok: true, summary: await response.json() });
      }).catch((error) => {
        debug("Import request threw an exception", error instanceof Error ? error.message : error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not import Clockify data." });
      });
      return true;
    });
  },
});
