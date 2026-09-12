const $ = (id) => document.getElementById(id);
const errorDetails = (error) => error instanceof Error ? error.message : String(error || "Unknown error");
function userError(fallback, error) {
  return fallback;
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
let timerLabelIds = [];
const timerSelectionKey = "timerSelection";

function setLoading(loading) {
  const loadingElement = $("loading");
  if (loadingElement) loadingElement.hidden = !loading;
  if (loading) {
    $("auth").hidden = true;
    $("workspace").hidden = true;
  }
}

function showAuth() {
  setLoading(false);
  $("auth").hidden = false;
  $("workspace").hidden = true;
}

function showWorkspace() {
  setLoading(false);
  $("auth").hidden = true;
  $("workspace").hidden = false;
}

function showTimer(timer) {
  currentTimer = timer;
  $("status").textContent = KnowCore.timerStatus(timer);
  setTimerToggle(KnowCore.timerIsRunning(timer));
  $("timer-details").disabled = !timer;
  if (!timer) closeTimerStartEditor();
  if (timerTicker) clearInterval(timerTicker);
  timerTicker = timer ? setInterval(() => { $("status").textContent = KnowCore.timerStatus(currentTimer); }, 1000) : null;
}
function setTimerToggle(running) {
  const button = $("toggle");
  button.className = `timer-toggle${running ? " is-running" : ""}`;
  button.textContent = running ? "■" : "▶";
  button.setAttribute("aria-label", running ? "Stop timer" : "Start timer");
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
  } catch (error) { throw error; }
  let base;
  try {
    base = KnowApiConfig.apiBase(apiBase);
  } catch (error) { throw error; }
  const url = base + path;
  const method = options.method || "GET";
  let r;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 15000);
  try {
    r = await fetch(url, {
    ...options,
      ...(controller ? { signal: controller.signal } : {}),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}`, ...(options.headers || {}) },
    });
  } catch (error) {
    clearTimeout(timeout);
    throw Error("Could not reach " + url + ". Check the SSH tunnel, API host permission, and CORS_ORIGINS. (" + errorDetails(error) + ")");
  }
  clearTimeout(timeout);
  const responseText = await r.text();
  if (r.status === 401 && token) {
    await chrome.storage.local.remove(["token", "activeTimer"]);
    location.reload();
    throw Error("Session expired");
  }
  if (!r.ok) {
    const error = Error("HTTP " + r.status + (responseText ? ": " + responseText.slice(0, 500) : ""));
    throw error;
  }
  try {
    return responseText ? JSON.parse(responseText) : null;
  } catch (error) {
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
function selectedLabelIds() { return [...timerLabelIds]; }
function selectedOptionIds(select) {
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
  timerLabelIds = [];
  renderTimerLabels();
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
      await loadSessions();
    } else if (timer && timerStateChanged(currentTimer, timer)) {
      showTimer(timer);
      await chrome.storage.local.set({ activeTimer: timer });
      await restoreTimerSelection(timerSelection(timer));
    }
  } catch (error) {
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
function renderLabelChips() {
  const container = $("selected-labels");
  container.replaceChildren();
  timerLabelIds.forEach((id) => {
    const label = labels.find((entry) => entry.id === id);
    if (!label) return;
    const chip = document.createElement("span");
    chip.className = "label-chip";
    const text = document.createElement("span");
    text.textContent = labelText(label);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "label-chip-remove";
    remove.setAttribute("aria-label", `Remove label ${labelText(label)}`);
    remove.textContent = "×";
    remove.onclick = async () => {
      timerLabelIds = timerLabelIds.filter((labelId) => labelId !== id);
      renderTimerLabels();
      try { await configureCurrentTimer(); } catch (error) { $("error").textContent = userError("Could not update the timer.", error); }
    };
    chip.append(text, remove);
    container.append(chip);
  });
}

function renderTimerLabels(selectedIds = timerLabelIds) {
  timerLabelIds = [...new Set(selectedIds.filter(Boolean))];
  renderLabelChips();
  const available = KnowCore.timerLabels(labels, $("path").value, timerLabelIds)
    .filter((label) => !timerLabelIds.includes(label.id));
  fillOptions($("label"), "Add a label…", available);
}
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
function closeTimerStartEditor() {
  $("timer-start-editor").hidden = true;
  $("timer-details").setAttribute("aria-expanded", "false");
}
function openTimerStartEditor() {
  if (!currentTimer?.startedAt) return;
  const [date, time] = localDateTime(currentTimer.startedAt).split("T");
  $("timer-started-date").value = date;
  $("timer-started-time").value = time;
  $("timer-start-editor").hidden = false;
  $("timer-details").setAttribute("aria-expanded", "true");
  $("timer-started-time").focus();
}
const sessionLabelIds = (session) => session.labelIds || [];
const labelFor = (id) => labels.find((label) => label.id === id);
const pathFor = (id) => paths.find((path) => path.id === id);
const sessionLabelSummary = (session) => sessionLabelIds(session).map((id) => labelFor(id)?.name || "Removed label").join(", ") || "Unassigned labels";
const sessionDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const duration = (session) => session.running ? "Running" : KnowCore.formatTimer(session.durationSeconds || 0);
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left, right) => left.getTime() === right.getTime();
const sessionGroupLabel = (startedAt) => {
  const date = startOfDay(new Date(startedAt));
  const today = startOfDay(new Date());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  if (date >= thisWeekStart) return "This week";
  if (date >= lastWeekStart) return "Last week";
  if (date.getFullYear() === lastMonth.getFullYear() && date.getMonth() === lastMonth.getMonth()) return "Last month";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
};

function renderSessions(history) {
  const container = $("sessions"); container.replaceChildren();
  const sessions = history?.sessions || (Array.isArray(history) ? history : []);
  if (!sessions.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No sessions recorded yet."; container.append(empty); return; }
  const groups = [];
  sessions.forEach((session) => {
    const label = sessionGroupLabel(session.startedAt);
    const group = groups.at(-1);
    if (group?.label === label) group.sessions.push(session); else groups.push({ label, sessions: [session] });
  });
  groups.forEach((group) => {
    const section = document.createElement("section"); section.className = "session-group";
    section.insertAdjacentHTML("beforeend", `<h3 class="session-group-heading">${escapeHtml(group.label)}</h3>`);
    const list = document.createElement("div"); list.className = "session-group-list";
    group.sessions.forEach((session) => {
      const article = document.createElement("article"); article.className = "session-card"; article.dataset.id = session.id;
      const pathName = pathFor(session.pathId)?.name;
      const labelsMarkup = sessionLabelIds(session).map((id) => `<span>${escapeHtml(labelFor(id)?.name || "Removed label")}</span>`).join("");
      article.insertAdjacentHTML("beforeend", `<div class="session-heading"><div>${pathName ? `<h4 class="session-title-chip">${escapeHtml(pathName)}</h4>` : ""}<div class="session-card-labels" aria-label="Session labels">${labelsMarkup}</div>${session.description ? `<p class="session-description">${escapeHtml(session.description)}</p>` : ""}</div><div class="session-actions"><button class="text-button edit-session" aria-label="${session.running ? "Stop timer to edit session" : "Edit session"}" ${session.running ? "disabled" : ""}>${session.running ? "Stop to edit" : "Edit"}</button>${session.running ? "" : '<button class="text-button danger remove-session" aria-label="Remove session">Remove</button>'}</div></div><div class="session-summary"><span>${escapeHtml(duration(session))}</span><span>${escapeHtml(session.source || "SESSION")} · ${escapeHtml(sessionDate(session.startedAt))}</span></div>`);
      list.append(article);
    });
    section.append(list); container.append(section);
  });
}
async function loadSessions() {
  try {
    renderSessions(await request("/time-entries?page=0&size=20"));
  } catch (error) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Recent sessions are unavailable. Try again later.";
    $("sessions").replaceChildren(empty);
  }
}

function renderSessionEditor(article, session) {
  const selectedIds = sessionLabelIds(session);
  article.insertAdjacentHTML("beforeend", `<form class="session-edit"><label>Description<textarea name="description" rows="2">${escapeHtml(session.description || "")}</textarea></label><div class="session-edit-grid"><label>Path<select name="pathId"><option value="">Unassigned</option>${paths.map((path) => `<option value="${escapeHtml(path.id)}" ${path.id === session.pathId ? "selected" : ""}>${escapeHtml(path.name)}</option>`).join("")}</select></label><label>Labels<select name="labelIds" multiple size="4">${KnowCore.timerLabels(labels, session.pathId || "", selectedIds).map((label) => `<option value="${escapeHtml(label.id)}" ${selectedIds.includes(label.id) ? "selected" : ""}>${escapeHtml(labelText(label))}</option>`).join("")}</select></label><label>Source<select name="source">${["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"].map((source) => `<option ${source === session.source ? "selected" : ""}>${source}</option>`).join("")}</select></label><label>Started<input name="startedAt" type="datetime-local" value="${localDateTime(session.startedAt)}" required></label><label>Ended<input name="endedAt" type="datetime-local" value="${localDateTime(session.endedAt)}" required></label></div><div class="label-actions"><button class="primary" type="submit">Save session</button><button class="text-button cancel-session" type="button">Cancel</button></div></form>`);
  const form = article.querySelector("form");
  form.querySelector('[name="pathId"]').onchange = (event) => { const select = form.querySelector('[name="labelIds"]'); const selected = selectedOptionIds(select); fillOptions(select, "", KnowCore.timerLabels(labels, event.target.value, selected), selected); };
  form.onsubmit = async (event) => {
    event.preventDefault(); const data = new FormData(form); const start = data.get("startedAt"); const end = data.get("endedAt");
    if (!start || !end || new Date(start) >= new Date(end)) { $("error").textContent = "A session needs a valid start and end time."; return; }
    try {
      await request(`/time-entries/${session.id}`, { method: "PUT", body: JSON.stringify({ pathId: data.get("pathId") || null, labelIds: selectedOptionIds(form.querySelector('[name="labelIds"]')), startedAt: isoDateTime(start), endedAt: isoDateTime(end), description: data.get("description") || null, source: data.get("source") }) });
      await loadSessions();
    } catch (error) { $("error").textContent = userError("Could not update this session.", error); }
  };
  form.querySelector(".cancel-session").onclick = loadSessions;
}

async function load() {
  setLoading(true);
  try {
    const { activeTimer, timerSelection: savedSelection } = await chrome.storage.local.get(["activeTimer", timerSelectionKey]);
    [paths, labels] = await Promise.all([request("/paths"), request("/labels?scope=TIME_ENTRY")]);
    const timer = await request("/timers/current");
    fillOptions($("path"), "Select a path", KnowCore.activePaths(paths));
    $("path").onchange = async () => {
      renderTimerLabels();
      try { await configureCurrentTimer(); } catch (error) { $("error").textContent = userError("Could not update the timer.", error); }
    };
    if (timer) { showTimer(timer); $("toggle").textContent = "Stop timer"; await chrome.storage.local.set({ activeTimer: timer }); await restoreTimerSelection(timerSelection(timer)); }
    else {
      showTimer(null); await chrome.storage.local.remove("activeTimer");
      if (activeTimer) await resetTimerForm();
      else await restoreTimerSelection(savedSelection || timerSelection(activeTimer));
    }
    showWorkspace(); startLiveTimerSync(); void loadSessions();
  } catch (error) {
    showAuth(); $("error").textContent = userError("Sign in failed or the API is unavailable.", error);
  }
}
async function login() {
  const button = $("login");
  const email = $("email").value;
  setButtonBusy(button, true);
  try { const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password: $("password").value }) }); await chrome.storage.local.set({ token: result.token }); $("error").textContent = ""; await load(); }
  catch (error) { $("error").textContent = userError("Check your credentials and API connection, then try again.", error); }
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
    $("error").textContent = userError("Google sign-in could not be completed. Try again.", error);
  } finally {
    setButtonBusy(button, false);
  }
}

$("login").onclick = login;
$("google-login").onclick = googleLogin;
$("logout").onclick = async () => { await chrome.storage.local.clear(); location.reload(); };
$("timer-details").onclick = () => {
  if ($("timer-start-editor").hidden) openTimerStartEditor(); else closeTimerStartEditor();
};
$("cancel-timer-start").onclick = closeTimerStartEditor;
$("timer-start-editor").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("save-timer-start");
  const date = $("timer-started-date").value;
  const time = $("timer-started-time").value;
  const startedAt = date && time ? `${date}T${time}` : "";
  if (!currentTimer || !startedAt) return;
  if (new Date(startedAt) > new Date()) {
    $("error").textContent = "A timer start cannot be in the future.";
    $("timer-started-time").focus();
    return;
  }
  setButtonBusy(button, true);
  try {
    const updated = await request(`/timers/${currentTimer.id}`, {
      method: "PUT",
      body: JSON.stringify({ pathId: $("path").value || null, labelIds: selectedLabelIds($("label")), startedAt: isoDateTime(startedAt), description: $("description").value || null }),
    });
    showTimer(updated);
    await chrome.storage.local.set({ activeTimer: updated });
    closeTimerStartEditor();
    $("error").textContent = "";
  } catch (error) {
    $("error").textContent = userError("Could not update the timer start.", error);
  } finally {
    setButtonBusy(button, false);
  }
};
$("toggle").onclick = async () => {
  const button = $("toggle");
  setButtonBusy(button, true);
  try {
    const current = await request("/timers/current");
    if (KnowCore.timerIsRunning(current)) { await flushDescriptionSave(); await request("/timers/stop", { method: "POST", body: "{}" }); await chrome.storage.local.remove("activeTimer"); await resetTimerForm(); showTimer(null); await loadSessions(); }
    else { const timer = await request("/timers", { method: "POST", body: JSON.stringify(KnowCore.timerStartPayload($("path").value, selectedLabelIds($("label")), $("description").value)) }); await persistTimerSelection(); await chrome.storage.local.set({ activeTimer: timer }); showTimer(timer); }
  } catch (error) { $("error").textContent = userError("Could not update the timer. Check the API connection and try again.", error); }
  finally { setButtonBusy(button, false); }
};
$("label").onchange = async () => {
  const labelId = $("label").value;
  if (!labelId || timerLabelIds.includes(labelId)) return;
  timerLabelIds = [...timerLabelIds, labelId];
  renderTimerLabels();
  try { await configureCurrentTimer(); } catch (error) { $("error").textContent = userError("Could not update the timer.", error); }
};
$("description").oninput = () => {
  void persistTimerSelection();
  if (descriptionSaveTicker) clearTimeout(descriptionSaveTicker);
  descriptionSaveTicker = setTimeout(async () => {
    try { await configureCurrentTimer(); } catch (error) { $("error").textContent = userError("Could not update the timer.", error); }
  }, 300);
};
$("sessions").onclick = async (event) => {
  const article = event.target.closest("article"); if (!article) return;
  const sessionId = article.dataset.id;
  if (event.target.closest(".edit-session")) { const history = await request("/time-entries?page=0&size=20"); const session = (history.sessions || []).find((entry) => entry.id === sessionId); if (session) renderSessionEditor(article, session); }
  if (event.target.closest(".remove-session") && confirm("Remove this session? This cannot be undone.")) { try { await request(`/time-entries/${sessionId}`, { method: "DELETE" }); await loadSessions(); } catch (error) { $("error").textContent = userError("Could not remove this session.", error); } }
};
$("settings-menu-toggle").onclick = () => {
  const menu = $("settings-menu");
  menu.hidden = !menu.hidden;
  $("settings-menu-toggle").setAttribute("aria-expanded", String(!menu.hidden));
};
function setClockifyImportEnabled(enabled) {
  const toggle = $("clockify-import-toggle");
  toggle.setAttribute("aria-checked", String(enabled));
  const state = toggle.querySelector?.(".menu-toggle-state");
  if (state) state.textContent = enabled ? "On" : "Off";
}
$("clockify-import-toggle").onclick = async () => {
  const enabled = $("clockify-import-toggle").getAttribute("aria-checked") !== "true";
  setClockifyImportEnabled(enabled);
  try {
    await chrome.storage.local.set({ [KnowClockifySettings.KEY]: enabled });
  } catch (error) {
    setClockifyImportEnabled(!enabled);
    $("error").textContent = userError("Could not save Clockify import setting.", error);
  }
};
$("options").onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.local.get(["token", "googleAuthError", KnowClockifySettings.KEY]).then(({ token, googleAuthError, [KnowClockifySettings.KEY]: clockifyImportEnabled }) => {
  const importEnabled = KnowClockifySettings.isEnabled(clockifyImportEnabled);
  setClockifyImportEnabled(importEnabled);
  if (googleAuthError) $("error").textContent = googleAuthError;
  if (token) load();
  else showAuth();
}).catch((error) => {
  showAuth(); $("error").textContent = userError("Could not read extension session.", error);
});
