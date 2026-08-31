const $ = (id) => document.getElementById(id);
const defaultApi = "http://localhost:8080/api/v1";
let currentTimer = null;
let timerTicker = null;
let paths = [];
let items = [];
const timerSelectionKey = "timerSelection";

function showTimer(timer) {
  currentTimer = timer;
  $("status").textContent = KnowCore.timerStatus(timer);
  if (timerTicker) clearInterval(timerTicker);
  timerTicker = timer ? setInterval(() => { $("status").textContent = KnowCore.timerStatus(currentTimer); }, 1000) : null;
}

async function request(path, options = {}) {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  const r = await fetch((apiBase || defaultApi) + path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}`, ...(options.headers || {}) },
  });
  if (r.status === 401 && token) {
    await chrome.storage.local.remove(["token", "activeTimer"]);
    location.reload();
    throw Error("Session expired");
  }
  if (!r.ok) throw Error((await r.text()) || "Request failed");
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function itemLabel(item) {
  return `${item.title}${item.status ? ` · ${item.status}` : ""}${item.progress !== undefined ? ` · ${item.progress}%` : ""}`;
}
function fillOptions(select, placeholder, values, selectedIds = []) {
  select.replaceChildren();
  if (!select.multiple) {
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = placeholder; select.append(empty);
  }
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.id; option.textContent = value.name || itemLabel(value);
    option.selected = selectedIds.includes(value.id); select.append(option);
  });
}
function selectedItemIds(select) {
  return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
}
function timerSelection(timer) {
  return { pathId: timer?.pathId || "", itemIds: timer?.itemIds?.length ? timer.itemIds : timer?.itemId ? [timer.itemId] : [], description: timer?.description || "" };
}
async function persistTimerSelection() {
  await chrome.storage.local.set({ [timerSelectionKey]: { pathId: $("path").value, itemIds: selectedItemIds($("item")), description: $("description").value } });
}
async function resetTimerForm() {
  $("path").value = "";
  Array.from($("item").options).forEach((option) => { option.selected = false; });
  $("description").value = "";
  await persistTimerSelection();
}
function hasOption(select, value) { return value && Array.from(select.options).some((option) => option.value === value); }
function renderTimerItems(selectedIds = []) { fillOptions($("item"), "Select items (optional)", KnowCore.itemsForPath(items, $("path").value, selectedIds), selectedIds); }
async function restoreTimerSelection(selection) {
  const saved = selection || {};
  const itemIds = saved.itemIds || (saved.itemId ? [saved.itemId] : []);
  $("path").value = hasOption($("path"), saved.pathId) ? saved.pathId : "";
  renderTimerItems(itemIds); $("description").value = saved.description || "";
  await persistTimerSelection();
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const localDateTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso); const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value) => new Date(value).toISOString();
const sessionItemIds = (session) => session.itemIds?.length ? session.itemIds : session.itemId ? [session.itemId] : [];
const itemFor = (id) => items.find((item) => item.id === id);
const pathFor = (id) => paths.find((path) => path.id === id);
const sessionItemSummary = (session) => sessionItemIds(session).map((id) => itemFor(id)?.title || "Removed item").join(", ") || "Unassigned items";
const sessionDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const duration = (session) => session.running ? "Running" : KnowCore.formatTimer(session.durationSeconds || 0);

function renderSessions(history) {
  const container = $("sessions"); container.replaceChildren();
  const sessions = history?.sessions || (Array.isArray(history) ? history : []);
  if (!sessions.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No sessions recorded yet."; container.append(empty); return; }
  sessions.forEach((session) => {
    const article = document.createElement("article"); article.className = "session-card"; article.dataset.id = session.id;
    article.insertAdjacentHTML("beforeend", `<div class="session-heading"><div><small>${escapeHtml(session.source || "SESSION")} · ${escapeHtml(sessionDate(session.startedAt))}</small><h3>${escapeHtml(session.description || "Untitled session")}</h3></div><div class="session-actions"><button class="text-button edit-session" ${session.running ? "disabled" : ""}>${session.running ? "Stop to edit" : "Edit"}</button>${session.running ? "" : '<button class="text-button danger remove-session">Remove</button>'}</div></div><div class="session-summary"><span>${escapeHtml(duration(session))}</span><span>${escapeHtml(pathFor(session.pathId)?.name || "Unassigned path")}</span><span>${escapeHtml(sessionItemSummary(session))}</span></div>`);
    if (pathFor(session.pathId) || sessionItemIds(session).length) article.insertAdjacentHTML("beforeend", `<div class="session-context">${pathFor(session.pathId) ? `<span><strong>Path:</strong> ${escapeHtml(pathFor(session.pathId).name)} · ${escapeHtml(pathFor(session.pathId).description || "No description")}</span>` : ""}${sessionItemIds(session).length ? `<span><strong>Items:</strong> ${escapeHtml(sessionItemSummary(session))}</span>` : ""}</div>`);
    container.append(article);
  });
}
async function loadSessions() { renderSessions(await request("/time-entries?page=0&size=20")); }

function renderSessionEditor(article, session) {
  const selectedIds = sessionItemIds(session);
  article.insertAdjacentHTML("beforeend", `<form class="session-edit"><label>Description<textarea name="description" rows="2">${escapeHtml(session.description || "")}</textarea></label><div class="session-edit-grid"><label>Path<select name="pathId"><option value="">Unassigned</option>${paths.map((path) => `<option value="${escapeHtml(path.id)}" ${path.id === session.pathId ? "selected" : ""}>${escapeHtml(path.name)}</option>`).join("")}</select></label><label>Items<select name="itemIds" multiple size="4">${KnowCore.itemsForPath(items, session.pathId || "", selectedIds).map((item) => `<option value="${escapeHtml(item.id)}" ${selectedIds.includes(item.id) ? "selected" : ""}>${escapeHtml(itemLabel(item))}</option>`).join("")}</select></label><label>Source<select name="source">${["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"].map((source) => `<option ${source === session.source ? "selected" : ""}>${source}</option>`).join("")}</select></label><label>Started<input name="startedAt" type="datetime-local" value="${localDateTime(session.startedAt)}" required></label><label>Ended<input name="endedAt" type="datetime-local" value="${localDateTime(session.endedAt)}" required></label></div><div class="item-actions"><button class="primary" type="submit">Save session</button><button class="text-button cancel-session" type="button">Cancel</button></div></form>`);
  const form = article.querySelector("form");
  form.querySelector('[name="pathId"]').onchange = (event) => { const select = form.querySelector('[name="itemIds"]'); const selected = selectedItemIds(select); fillOptions(select, "", KnowCore.itemsForPath(items, event.target.value, selected), selected); };
  form.onsubmit = async (event) => {
    event.preventDefault(); const data = new FormData(form); const start = data.get("startedAt"); const end = data.get("endedAt");
    if (!start || !end || new Date(start) >= new Date(end)) { $("error").textContent = "A session needs a valid start and end time."; return; }
    try {
      await request(`/time-entries/${session.id}`, { method: "PUT", body: JSON.stringify({ pathId: data.get("pathId") || null, itemIds: selectedItemIds(form.querySelector('[name="itemIds"]')), startedAt: isoDateTime(start), endedAt: isoDateTime(end), description: data.get("description") || null, source: data.get("source") }) });
      await loadSessions();
    } catch { $("error").textContent = "Could not update this session."; }
  };
  form.querySelector(".cancel-session").onclick = loadSessions;
}

async function load() {
  try {
    const { activeTimer, timerSelection: savedSelection } = await chrome.storage.local.get(["activeTimer", timerSelectionKey]);
    [paths, items] = await Promise.all([request("/paths"), request("/items")]);
    const timer = await request("/timers/current");
    fillOptions($("path"), "Select a path", KnowCore.activePaths(paths));
    $("path").onchange = () => { renderTimerItems(selectedItemIds($("item"))); persistTimerSelection(); };
    if (timer) { showTimer(timer); $("toggle").textContent = "Stop timer"; await chrome.storage.local.set({ activeTimer: timer }); await restoreTimerSelection(timerSelection(timer)); }
    else { showTimer(null); $("toggle").textContent = "Start timer"; await chrome.storage.local.remove("activeTimer"); await restoreTimerSelection(savedSelection || timerSelection(activeTimer)); }
    $("auth").hidden = true; $("workspace").hidden = false; await loadSessions();
  } catch { $("error").textContent = "Sign in failed or the API is unavailable."; }
}
async function login() {
  try { const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) }); await chrome.storage.local.set({ token: result.token }); $("error").textContent = ""; await load(); }
  catch { $("error").textContent = "Invalid credentials."; }
}

$("login").onclick = login;
$("logout").onclick = async () => { await chrome.storage.local.clear(); location.reload(); };
$("toggle").onclick = async () => {
  try {
    const current = await request("/timers/current");
    if (KnowCore.timerIsRunning(current)) { await request("/timers/stop", { method: "POST", body: "{}" }); await chrome.storage.local.remove("activeTimer"); await resetTimerForm(); showTimer(null); $("toggle").textContent = "Start timer"; await loadSessions(); }
    else { const timer = await request("/timers", { method: "POST", body: JSON.stringify(KnowCore.timerStartPayload($("path").value, selectedItemIds($("item")), $("description").value)) }); await persistTimerSelection(); await chrome.storage.local.set({ activeTimer: timer }); showTimer(timer); $("toggle").textContent = "Stop timer"; }
  } catch { $("error").textContent = "Could not update timer."; }
};
$("item").onchange = persistTimerSelection;
$("description").oninput = persistTimerSelection;
$("sessions").onclick = async (event) => {
  const article = event.target.closest("article"); if (!article) return;
  const sessionId = article.dataset.id;
  if (event.target.closest(".edit-session")) { const history = await request("/time-entries?page=0&size=20"); const session = (history.sessions || []).find((entry) => entry.id === sessionId); if (session) renderSessionEditor(article, session); }
  if (event.target.closest(".remove-session") && confirm("Remove this session? This cannot be undone.")) { try { await request(`/time-entries/${sessionId}`, { method: "DELETE" }); await loadSessions(); } catch { $("error").textContent = "Could not remove this session."; } }
};
chrome.storage.local.get("token").then(({ token }) => { if (token) load(); });
$("options").onclick = () => chrome.runtime.openOptionsPage();
