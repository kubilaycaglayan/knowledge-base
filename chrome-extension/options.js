const apiInput = document.getElementById("api");
const status = document.getElementById("status");
function normalize(value) {
  return value.trim().replace(/\/$/, "");
}
async function load() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  apiInput.value = apiBase || "http://localhost:8080/api/v1";
}
async function save() {
  try {
    const value = normalize(apiInput.value);
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.pathname.endsWith("/api/v1")
    )
      throw Error("Use an HTTP(S) URL ending in /api/v1");
    const origin = `${url.protocol}//${url.host}`;
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    });
    if (!granted) throw Error("Permission was not granted");
    await chrome.storage.local.set({ apiBase: value });
    status.textContent = "Saved.";
  } catch (error) {
    status.textContent = error.message || "Could not save settings.";
  }
}
document.getElementById("save").onclick = save;
load();
