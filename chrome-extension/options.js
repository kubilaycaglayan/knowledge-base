const apiInput = document.getElementById("api");
const status = document.getElementById("status");
const debug = (...args) => {
  if (typeof __KNOW_EXTENSION_ENV__ !== "string" || __KNOW_EXTENSION_ENV__ !== "production")
    console.warn("[Know extension]", ...args);
};
function normalize(value) {
  return value.trim().replace(/\/$/, "");
}
async function load() {
  try {
    const { apiBase } = await chrome.storage.local.get("apiBase");
    apiInput.value = KnowApiConfig.apiBase(apiBase);
    debug("Loaded API settings", { apiBase: apiInput.value, storedApiBase: apiBase || null });
  } catch (error) {
    debug("Failed to load API settings", { error: error instanceof Error ? error.message : String(error) });
    status.textContent = "Could not load API settings.";
  }
}
async function save() {
  const button = document.getElementById("save");
  button.disabled = true;
  if (button.setAttribute) button.setAttribute("aria-busy", "true");
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
    debug("Saved API settings", { apiBase: normalized, permissionGranted: granted });
    status.textContent = "Saved.";
  } catch (error) {
    debug("Failed to save API settings", { requestedApiBase: apiInput.value, error: error instanceof Error ? error.message : String(error) });
    status.textContent = error.message || "Could not save settings.";
  } finally {
    button.disabled = false;
    if (button.setAttribute) button.setAttribute("aria-busy", "false");
  }
}
document.getElementById("save").onclick = save;
load();
