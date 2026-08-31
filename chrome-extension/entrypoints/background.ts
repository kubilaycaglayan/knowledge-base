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
      if (sender.origin && sender.origin !== "https://app.clockify.me") return false;
      chrome.storage.local.get(["token", "apiBase"]).then(async ({ token, apiBase }) => {
        if (!token) return sendResponse({ ok: false, needsLogin: true, error: "Sign in through the Know extension first." });
        const response = await fetch((apiBase || "http://localhost:8080/api/v1") + "/imports/clockify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(message.payload),
        });
        if (response.status === 401) {
          return sendResponse({ ok: false, needsLogin: true, error: "Know rejected this automatic import. Open the extension to verify your session." });
        }
        if (!response.ok) return sendResponse({ ok: false, error: (await response.text()) || "Could not import Clockify data." });
        sendResponse({ ok: true, summary: await response.json() });
      }).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not import Clockify data." }));
      return true;
    });
  },
});
