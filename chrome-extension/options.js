const apiInput = document.getElementById("api");
const status = document.getElementById("status");
function normalize(value) {
  return value.trim().replace(/\/$/, "");
}
async function load() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  apiInput.value = KnowApiConfig.apiBase(apiBase);
}
async function save() {
  try {
    const value = normalize(apiInput.value);
    const normalized = KnowApiConfig.normalize(value);
    const url = new URL(normalized);
    const origin = `${url.protocol}//${url.host}`;
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    });
    if (!granted) throw Error("Permission was not granted");
    await chrome.storage.local.set({ apiBase: normalized });
    status.textContent = "Saved.";
  } catch (error) {
    status.textContent = error.message || "Could not save settings.";
  }
}
document.getElementById("save").onclick = save;
load();
