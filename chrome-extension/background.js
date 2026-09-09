const defaultApi = "http://localhost:8080/api/v1";
const debug = (...args) => console.warn("[Know extension]", ...args);

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get("activeTimer"));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "KNOW_OPEN_POPUP") {
    chrome.action.openPopup().catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }));
    return false;
  }
  if (message?.type === "KNOW_GOOGLE_LOGIN") {
    void googleLogin().then(sendResponse).catch((error) => {
      debug("Google sign-in failed", error instanceof Error ? error.message : error);
      sendResponse({ ok: false, error: "Google sign-in could not be completed. Try again." });
    });
    return true;
  }
  if (message?.type !== "KNOW_CLOCKIFY_IMPORT") return false;
  if (sender.origin && sender.origin !== "https://app.clockify.me") {
    debug("Rejected message from unexpected sender origin", sender.origin);
    return false;
  }
  debug("Received Clockify import message", {
    senderOrigin: sender.origin || "(not provided)",
    entryCount: Array.isArray(message.payload?.timeentries) ? message.payload.timeentries.length : "invalid",
  });
  void importClockify(message.payload).then(sendResponse).catch((error) => {
    debug("Import request threw an exception", error instanceof Error ? error.message : error);
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not import Clockify data." });
  });
  return true;
});

async function googleLogin() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  const base = apiBase || defaultApi;
  const configResponse = await fetch(base + "/auth/google/config");
  if (!configResponse.ok) throw Error("Google configuration request failed (HTTP " + configResponse.status + ")");
  const { clientId } = await configResponse.json();
  if (!clientId) throw Error("Google sign-in is not configured");
  const state = KnowGoogleAuth.nonce();
  const requestNonce = KnowGoogleAuth.nonce();
  const redirectUri = chrome.identity.getRedirectURL();
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: KnowGoogleAuth.authorizationUrl(clientId, redirectUri, state, requestNonce),
    interactive: true,
  });
  const idToken = KnowGoogleAuth.parseRedirect(redirectUrl, state, requestNonce);
  const response = await fetch(base + "/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw Error("Google authentication failed (HTTP " + response.status + ")");
  const result = await response.json();
  await chrome.storage.local.set({ token: result.token });
  return { ok: true, token: result.token };
}

async function importClockify(payload) {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  const base = apiBase || defaultApi;
  const url = base + "/imports/clockify";
  debug("Preparing Clockify import request", {
    apiBase: base,
    tokenPresent: Boolean(token),
    tokenLength: typeof token === "string" ? token.length : 0,
    entryCount: Array.isArray(payload?.timeentries) ? payload.timeentries.length : "invalid",
  });
  if (!token) {
    debug("Import stopped because no extension token is stored");
    return { ok: false, needsLogin: true, error: "Sign in through the Know extension first." };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  debug("Clockify import response", {
    requestUrl: url,
    responseUrl: response.url,
    status: response.status,
    redirected: response.redirected,
    contentType: response.headers.get("content-type"),
  });
  if (response.status === 401) {
    const body = await response.text();
    debug("API rejected the stored extension token with HTTP 401; token was not removed", { responseBody: body || "(empty)" });
    return { ok: false, needsLogin: true, error: "Know rejected this automatic import. Open the extension to verify your session." };
  }
  if (response.status === 403) {
    debug("API rejected the extension origin with HTTP 403; check CORS_ORIGINS", { responseBody: await response.text() || "(empty)" });
    return { ok: false, error: "Know blocked the extension request. Add this extension ID to the API CORS origins." };
  }
  if (!response.ok) throw Error((await response.text()) || "Could not import Clockify data.");
  return { ok: true, summary: await response.json() };
}
