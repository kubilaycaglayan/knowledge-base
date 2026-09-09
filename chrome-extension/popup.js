const $ = (id) => document.getElementById(id);
const debug = (...args) => {
  if (typeof __KNOW_EXTENSION_ENV__ !== "string" || __KNOW_EXTENSION_ENV__ !== "production")
    console.warn("[Know extension]", ...args);
};
const isDevelopment = () => typeof __KNOW_EXTENSION_ENV__ === "string" && __KNOW_EXTENSION_ENV__ !== "production";
const errorDetails = (error) => error instanceof Error ? error.message : String(error || "Unknown error");
function logError(operation, error, details = {}) {
  debug("Operation failed", { operation, ...details, error: errorDetails(error), stack: error?.stack });
}
function userError(fallback, error) {
  return isDevelopment() ? fallback + " " + errorDetails(error) : fallback;
}
function setButtonBusy(button, busy) {
  button.disabled = busy;
  if (button.setAttribute) button.setAttribute("aria-busy", String(busy));
}
let currentTimer = null;
let timerTicker = null;
let liveSyncTicker = null;
let liveSyncInFlight = false;
let descriptionSaveTicker = null;
let paths = [];
let labels = [];
const timerSelectionKey = "timerSelection";

function showTimer(timer) {
  currentTimer = timer;
  $("status").textContent = KnowCore.timerStatus(timer);
  if (timerTicker) clearInterval(timerTicker);
  timerTicker = timer ? setInterval(() => { $("status").textContent = KnowCore.timerStatus(currentTimer); }, 1000) : null;
}

function timerStateChanged(previous, next) {
  const labelIds = (timer) => [...(timer?.labelIds || [])].sort();
  return previous?.id !== next?.id
    || previous?.startedAt !== next?.startedAt
    || previous?.endedAt !== next?.endedAt
    || previous?.description !== next?.description
    || previous?.pathId !== next?.pathId
    || JSON.stringify(labelIds(previous)) !== JSON.stringify(labelIds(next))
    || previous?.running !== next?.running;
}

async function request(path, options = {}) {
  let token;
  let apiBase;
  try {
    ({ token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]));
  } catch (error) {
    logError("Read API configuration", error, { path });
    throw error;
  }
  let base;
  try {
    base = KnowApiConfig.apiBase(apiBase);
  } catch (error) {
    logError("Resolve API configuration", error, { path, storedApiBase: apiBase || null });
    throw error;
  }
  const url = base + path;
  const method = options.method || "GET";
  debug("Preparing popup API request", {
    method,
    apiBase: base,
    path,
    storedApiBase: apiBase || null,
    tokenPresent: Boolean(token),
    tokenLength: typeof token === "string" ? token.length : 0,
  });
  let r;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    r = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}`, ...(options.headers || {}) },
    });
  } catch (error) {
    clearTimeout(timeout);
    logError("API request", error, { method, url, kind: "network-or-cors" });
    throw Error("Could not reach " + url + ". Check the SSH tunnel, API host permission, and CORS_ORIGINS. (" + errorDetails(error) + ")");
  }
  clearTimeout(timeout);
  debug("Popup API response", {
    requestUrl: url,
    responseUrl: r.url,
    status: r.status,
    redirected: r.redirected,
    contentType: r.headers.get("content-type"),
  });
  const responseText = await r.text();
  debug("Popup API response body", {
    requestUrl: url,
    status: r.status,
    body: responseText.slice(0, 1000),
    bodyTruncated: responseText.length > 1000,
  });
  if (r.status === 401 && token) {
    logError("API authentication", Error("Session token rejected"), { method, url, status: r.status, responseBody: responseText });
    await chrome.storage.local.remove(["token", "activeTimer"]);
    location.reload();
    throw Error("Session expired");
  }
  if (!r.ok) {
    const error = Error("HTTP " + r.status + (responseText ? ": " + responseText.slice(0, 500) : ""));
    logError("API response", error, { method, url, status: r.status, responseBody: responseText });
    throw error;
  }
  try {
    return responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    logError("API response parsing", error, { method, url, status: r.status, responseBody: responseText });
    throw Error("API returned invalid JSON (" + errorDetails(error) + ")");
  }
}

function labelText(label) {
  return label.name;
}
function fillOptions(select, placeholder, values, selectedIds = []) {
  select.replaceChildren();
  if (!select.multiple) {
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = placeholder; select.append(empty);
  }
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.id; option.textContent = value.name || labelText(value);
    option.selected = selectedIds.includes(value.id); select.append(option);
  });
}
function selectedLabelIds(select) {
  return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
}
function timerSelection(timer) {
  return { pathId: timer?.pathId || "", labelIds: timer?.labelIds || [], description: timer?.description || "" };
}
async function persistTimerSelection() {
  await chrome.storage.local.set({ [timerSelectionKey]: { pathId: $("path").value, labelIds: selectedLabelIds($("label")), description: $("description").value } });
}
async function configureCurrentTimer() {
  if (!currentTimer) {
    await persistTimerSelection();
    return;
  }
  const updated = await request(`/timers/${currentTimer.id}`, {
    method: "PUT",
    body: JSON.stringify({
      pathId: $("path").value || null,
      labelIds: selectedLabelIds($("label")),
      startedAt: currentTimer.startedAt,
      description: $("description").value || null,
    }),
  });
  showTimer(updated);
  await chrome.storage.local.set({ activeTimer: updated });
  await restoreTimerSelection(timerSelection(updated));
}
async function flushDescriptionSave() {
  if (!descriptionSaveTicker) return;
  clearTimeout(descriptionSaveTicker);
  descriptionSaveTicker = null;
  await configureCurrentTimer();
}
async function resetTimerForm() {
  $("path").value = "";
  Array.from($("label").options).forEach((option) => { option.selected = false; });
  $("description").value = "";
  await persistTimerSelection();
}
async function syncTimerState() {
  if (liveSyncInFlight) return;
  liveSyncInFlight = true;
  try {
    const timer = await request("/timers/current");
    if (!timer && currentTimer) {
      currentTimer = null;
      await chrome.storage.local.remove("activeTimer");
      await resetTimerForm();
      showTimer(null);
      $("toggle").textContent = "Start timer";
      await loadSessions();
    } else if (timer && timerStateChanged(currentTimer, timer)) {
      showTimer(timer);
      await chrome.storage.local.set({ activeTimer: timer });
      await restoreTimerSelection(timerSelection(timer));
      $("toggle").textContent = "Stop timer";
    }
  } catch (error) {
    logError("Synchronize timer state", error);
    // The popup's normal load/request error handling remains authoritative.
  } finally {
    liveSyncInFlight = false;
  }
}
function startLiveTimerSync() {
  if (liveSyncTicker) clearInterval(liveSyncTicker);
  // The popup is short-lived, so keep the authoritative server state fresh
  // only while it is open. This catches stops made in the web app without a
  // user action in the extension.
  liveSyncTicker = setInterval(syncTimerState, 2000);
}
function hasOption(select, value) { return value && Array.from(select.options).some((option) => option.value === value); }
function renderTimerLabels(selectedIds = []) { fillOptions($("label"), "Select labels (optional)", KnowCore.timerLabels(labels, $("path").value, selectedIds), selectedIds); }
async function restoreTimerSelection(selection) {
  const saved = selection || {};
  const labelIds = saved.labelIds || [];
  $("path").value = hasOption($("path"), saved.pathId) ? saved.pathId : "";
  renderTimerLabels(labelIds); $("description").value = saved.description || "";
  await persistTimerSelection();
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const localDateTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso); const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value) => new Date(value).toISOString();
const sessionLabelIds = (session) => session.labelIds || [];
const labelFor = (id) => labels.find((label) => label.id === id);
const pathFor = (id) => paths.find((path) => path.id === id);
const sessionLabelSummary = (session) => sessionLabelIds(session).map((id) => labelFor(id)?.name || "Removed label").join(", ") || "Unassigned labels";
const sessionDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const duration = (session) => session.running ? "Running" : KnowCore.formatTimer(session.durationSeconds || 0);

function renderSessions(history) {
  const container = $("sessions"); container.replaceChildren();
  const sessions = history?.sessions || (Array.isArray(history) ? history : []);
  if (!sessions.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No sessions recorded yet."; container.append(empty); return; }
  sessions.forEach((session) => {
    const article = document.createElement("article"); article.className = "session-card"; article.dataset.id = session.id;
    article.insertAdjacentHTML("beforeend", `<div class="session-heading"><div><small>${escapeHtml(session.source || "SESSION")} · ${escapeHtml(sessionDate(session.startedAt))}</small><h3>${escapeHtml(session.description || "Untitled session")}</h3></div><div class="session-actions"><button class="text-button edit-session" ${session.running ? "disabled" : ""}>${session.running ? "Stop to edit" : "Edit"}</button>${session.running ? "" : '<button class="text-button danger remove-session">Remove</button>'}</div></div><div class="session-summary"><span>${escapeHtml(duration(session))}</span><span>${escapeHtml(pathFor(session.pathId)?.name || "Unassigned path")}</span><span>${escapeHtml(sessionLabelSummary(session))}</span></div>`);
    if (pathFor(session.pathId) || sessionLabelIds(session).length) article.insertAdjacentHTML("beforeend", `<div class="session-context">${pathFor(session.pathId) ? `<span><strong>Path:</strong> ${escapeHtml(pathFor(session.pathId).name)} · ${escapeHtml(pathFor(session.pathId).description || "No description")}</span>` : ""}${sessionLabelIds(session).length ? `<span><strong>Labels:</strong> ${escapeHtml(sessionLabelSummary(session))}</span>` : ""}</div>`);
    container.append(article);
  });
}
async function loadSessions() { renderSessions(await request("/time-entries?page=0&size=20")); }

function renderSessionEditor(article, session) {
  const selectedIds = sessionLabelIds(session);
  article.insertAdjacentHTML("beforeend", `<form class="session-edit"><label>Description<textarea name="description" rows="2">${escapeHtml(session.description || "")}</textarea></label><div class="session-edit-grid"><label>Path<select name="pathId"><option value="">Unassigned</option>${paths.map((path) => `<option value="${escapeHtml(path.id)}" ${path.id === session.pathId ? "selected" : ""}>${escapeHtml(path.name)}</option>`).join("")}</select></label><label>Labels<select name="labelIds" multiple size="4">${KnowCore.timerLabels(labels, session.pathId || "", selectedIds).map((label) => `<option value="${escapeHtml(label.id)}" ${selectedIds.includes(label.id) ? "selected" : ""}>${escapeHtml(labelText(label))}</option>`).join("")}</select></label><label>Source<select name="source">${["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"].map((source) => `<option ${source === session.source ? "selected" : ""}>${source}</option>`).join("")}</select></label><label>Started<input name="startedAt" type="datetime-local" value="${localDateTime(session.startedAt)}" required></label><label>Ended<input name="endedAt" type="datetime-local" value="${localDateTime(session.endedAt)}" required></label></div><div class="label-actions"><button class="primary" type="submit">Save session</button><button class="text-button cancel-session" type="button">Cancel</button></div></form>`);
  const form = article.querySelector("form");
  form.querySelector('[name="pathId"]').onchange = (event) => { const select = form.querySelector('[name="labelIds"]'); const selected = selectedLabelIds(select); fillOptions(select, "", KnowCore.timerLabels(labels, event.target.value, selected), selected); };
  form.onsubmit = async (event) => {
    event.preventDefault(); const data = new FormData(form); const start = data.get("startedAt"); const end = data.get("endedAt");
    if (!start || !end || new Date(start) >= new Date(end)) { $("error").textContent = "A session needs a valid start and end time."; return; }
    try {
      await request(`/time-entries/${session.id}`, { method: "PUT", body: JSON.stringify({ pathId: data.get("pathId") || null, labelIds: selectedLabelIds(form.querySelector('[name="labelIds"]')), startedAt: isoDateTime(start), endedAt: isoDateTime(end), description: data.get("description") || null, source: data.get("source") }) });
      await loadSessions();
    } catch (error) { logError("Update session", error, { sessionId }); $("error").textContent = userError("Could not update this session.", error); }
  };
  form.querySelector(".cancel-session").onclick = loadSessions;
}

async function load() {
  try {
    const { activeTimer, timerSelection: savedSelection } = await chrome.storage.local.get(["activeTimer", timerSelectionKey]);
    [paths, labels] = await Promise.all([request("/paths"), request("/calendar/labels")]);
    const timer = await request("/timers/current");
    fillOptions($("path"), "Select a path", KnowCore.activePaths(paths));
    $("path").onchange = async () => {
      renderTimerLabels(selectedLabelIds($("label")));
      try { await configureCurrentTimer(); } catch (error) { logError("Change timer path", error); $("error").textContent = userError("Could not update the timer.", error); }
    };
    if (timer) { showTimer(timer); $("toggle").textContent = "Stop timer"; await chrome.storage.local.set({ activeTimer: timer }); await restoreTimerSelection(timerSelection(timer)); }
    else {
      showTimer(null); $("toggle").textContent = "Start timer"; await chrome.storage.local.remove("activeTimer");
      if (activeTimer) await resetTimerForm();
      else await restoreTimerSelection(savedSelection || timerSelection(activeTimer));
    }
    $("auth").hidden = true; $("workspace").hidden = false; await loadSessions(); startLiveTimerSync();
  } catch (error) { logError("Load workspace", error); $("error").textContent = userError("Sign in failed or the API is unavailable.", error); }
}
async function login() {
  const button = $("login");
  const email = $("email").value;
  debug("Starting password login", { email, passwordPresent: Boolean($("password").value), passwordLength: $("password").value.length });
  setButtonBusy(button, true);
  try { const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password: $("password").value }) }); await chrome.storage.local.set({ token: result.token }); $("error").textContent = ""; await load(); }
  catch (error) { logError("Password login", error, { email }); $("error").textContent = userError("Check your credentials and API connection, then try again.", error); }
  finally { setButtonBusy(button, false); }
}

async function googleLogin() {
  const button = $("google-login");
  setButtonBusy(button, true);
  try {
    await chrome.storage.local.remove("googleAuthError");
    // Google may close this popup while the background service worker owns
    // the external auth flow. The token is stored by the worker and picked up
    // by the normal popup load on the next open.
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "KNOW_GOOGLE_LOGIN" }, (response) => {
        if (chrome.runtime.lastError) reject(Error(chrome.runtime.lastError.message));
        else if (!response?.ok) reject(Error(response?.error || "Google sign-in failed"));
        else resolve(response);
      });
    });
    $("error").textContent = "Complete Google sign-in, then reopen the extension.";
  } catch (error) {
    logError("Google sign-in", error);
    $("error").textContent = userError("Google sign-in could not be completed. Try again.", error);
  } finally {
    setButtonBusy(button, false);
  }
}

$("login").onclick = login;
$("google-login").onclick = googleLogin;
$("logout").onclick = async () => { await chrome.storage.local.clear(); location.reload(); };
$("toggle").onclick = async () => {
  const button = $("toggle");
  setButtonBusy(button, true);
  try {
    const current = await request("/timers/current");
    if (KnowCore.timerIsRunning(current)) { await flushDescriptionSave(); await request("/timers/stop", { method: "POST", body: "{}" }); await chrome.storage.local.remove("activeTimer"); await resetTimerForm(); showTimer(null); $("toggle").textContent = "Start timer"; await loadSessions(); }
    else { const timer = await request("/timers", { method: "POST", body: JSON.stringify(KnowCore.timerStartPayload($("path").value, selectedLabelIds($("label")), $("description").value)) }); await persistTimerSelection(); await chrome.storage.local.set({ activeTimer: timer }); showTimer(timer); $("toggle").textContent = "Stop timer"; }
  } catch (error) { logError("Toggle timer", error); $("error").textContent = userError("Could not update the timer. Check the API connection and try again.", error); }
  finally { setButtonBusy(button, false); }
};
$("label").onchange = async () => {
  try { await configureCurrentTimer(); } catch (error) { logError("Select timer labels", error); $("error").textContent = userError("Could not update the timer.", error); }
};
$("description").oninput = () => {
  void persistTimerSelection();
  if (descriptionSaveTicker) clearTimeout(descriptionSaveTicker);
  descriptionSaveTicker = setTimeout(async () => {
    try { await configureCurrentTimer(); } catch (error) { logError("Save timer description", error); $("error").textContent = userError("Could not update the timer.", error); }
  }, 300);
};
$("sessions").onclick = async (event) => {
  const article = event.target.closest("article"); if (!article) return;
  const sessionId = article.dataset.id;
  if (event.target.closest(".edit-session")) { const history = await request("/time-entries?page=0&size=20"); const session = (history.sessions || []).find((entry) => entry.id === sessionId); if (session) renderSessionEditor(article, session); }
  if (event.target.closest(".remove-session") && confirm("Remove this session? This cannot be undone.")) { try { await request(`/time-entries/${sessionId}`, { method: "DELETE" }); await loadSessions(); } catch (error) { logError("Remove session", error, { sessionId }); $("error").textContent = userError("Could not remove this session.", error); } }
};
chrome.storage.local.get(["token", "googleAuthError"]).then(({ token, googleAuthError }) => {
  debug("Popup initialized", { tokenPresent: Boolean(token) });
  if (googleAuthError) $("error").textContent = googleAuthError;
  if (token) load();
}).catch((error) => {
  logError("Read extension session", error);
  $("error").textContent = userError("Could not read extension session.", error);
});
$("options").onclick = () => chrome.runtime.openOptionsPage();
