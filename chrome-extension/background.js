const defaultApi = "http://localhost:8080/api/v1";

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get("activeTimer"));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "KNOW_OPEN_POPUP") {
    chrome.action.openPopup().catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }));
    return false;
  }
  if (message?.type !== "KNOW_CLOCKIFY_IMPORT") return false;
  if (sender.origin && sender.origin !== "https://app.clockify.me") return false;
  void importClockify(message.payload).then(sendResponse).catch((error) =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not import Clockify data." }));
  return true;
});

async function importClockify(payload) {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  if (!token) return { ok: false, needsLogin: true, error: "Sign in through the Know extension first." };
  const response = await fetch((apiBase || defaultApi) + "/imports/clockify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) {
    return { ok: false, needsLogin: true, error: "Know rejected this automatic import. Open the extension to verify your session." };
  }
  if (!response.ok) throw Error((await response.text()) || "Could not import Clockify data.");
  return { ok: true, summary: await response.json() };
}
