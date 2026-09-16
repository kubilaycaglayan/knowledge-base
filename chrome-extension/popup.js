const $ = (id) => document.getElementById(id);
const errorDetails = (error) =>
  error instanceof Error ? error.message : String(error || "Unknown error");
function userError(fallback, error) {
  return errorDetails(error) || fallback;
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
let labelsExpanded = false;
let timerLabelIds = [];
let timerRevision = 0;
let savingTimer = false;
let timerSaveQueued = false;
let selectionBaseline = { pathId: "", labelIds: [], description: "" };
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
  timerTicker = timer
    ? setInterval(() => {
        $("status").textContent = KnowCore.timerStatus(currentTimer);
      }, 1000)
    : null;
}
function setTimerToggle(running) {
  const button = $("toggle");
  button.className = `timer-toggle${running ? " is-running" : ""}`;
  button.textContent = running ? "■" : "▶";
  button.setAttribute("aria-label", running ? "Stop timer" : "Start timer");
}

function timerStateChanged(previous, next) {
  const labelIds = (timer) => [...(timer?.labelIds || [])].sort();
  return (
    previous?.id !== next?.id ||
    previous?.startedAt !== next?.startedAt ||
    previous?.endedAt !== next?.endedAt ||
    previous?.description !== next?.description ||
    previous?.pathId !== next?.pathId ||
    JSON.stringify(labelIds(previous)) !== JSON.stringify(labelIds(next)) ||
    previous?.running !== next?.running
  );
}

async function request(path, options = {}) {
  let token;
  let apiBase;
  try {
    ({ token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]));
  } catch (error) {
    throw error;
  }
  let base;
  try {
    base = KnowApiConfig.apiBase(apiBase);
  } catch (error) {
    throw error;
  }
  const url = base + path;
  const method = options.method || "GET";
  let r;
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 15000);
  try {
    r = await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    throw Error(
      "Could not reach " +
        url +
        ". Check the SSH tunnel, API host permission, and CORS_ORIGINS. (" +
        errorDetails(error) +
        ")",
    );
  }
  clearTimeout(timeout);
  const responseText = await r.text();
  if (r.status === 401 && token) {
    await chrome.storage.local.remove(["token", "activeTimer"]);
    location.reload();
    throw Error("Session expired");
  }
  if (!r.ok) {
    let message = responseText;
    try {
      const payload = responseText ? JSON.parse(responseText) : null;
      message = payload?.message || payload?.error || responseText;
    } catch (_) {
      // Preserve plain-text server errors.
    }
    throw Error(message || "HTTP " + r.status + " request failed");
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
    empty.value = "";
    empty.textContent = placeholder;
    select.append(empty);
  }
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.id;
    option.textContent = value.name || labelText(value);
    option.selected = selectedIds.includes(value.id);
    select.append(option);
  });
}
function fillPathOptions(select, values) {
  select.replaceChildren();
  const addPath = document.createElement("option");
  addPath.value = "__add_new_path__";
  addPath.textContent = "＋ Add a new path…";
  select.append(addPath);
  const separator = document.createElement("option");
  separator.disabled = true;
  separator.textContent = "────────";
  separator.setAttribute?.("aria-hidden", "true");
  select.append(separator);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.id;
    option.textContent = value.name;
    option.selected = false;
    select.append(option);
  });
  select.selectedIndex = -1;
}
async function chooseExtensionPath() {
  const selectedPath = $("path").value;
  if (selectedPath === "__add_new_path__") {
    const name = window.prompt("New path name")?.trim();
    if (!name) {
      $("path").value = "";
      return;
    }
    try {
      const created = await request("/paths", {
        method: "POST",
        body: JSON.stringify({ name, description: null, color: null }),
      });
      paths = [...paths, created];
      fillPathOptions($("path"), KnowCore.activePaths(paths));
      $("path").value = created.id;
    } catch (error) {
      $("path").value = "";
      $("error").textContent = userError("Could not create path.", error);
      return;
    }
  }
  renderTimerLabels();
  try {
    await configureCurrentTimer();
  } catch (error) {
    $("error").textContent = userError("Could not update the timer.", error);
  }
}
function selectedLabelIds() {
  return [...timerLabelIds];
}
function selectedOptionIds(select) {
  return Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);
}
function timerSelection(timer) {
  return {
    pathId: timer?.pathId || "",
    labelIds: timer?.labelIds || [],
    description: timer?.description || "",
  };
}
async function persistTimerSelection() {
  await chrome.storage.local.set({
    [timerSelectionKey]: {
      pathId: $("path").value,
      labelIds: selectedLabelIds($("label")),
      description: $("description").value,
    },
  });
}
async function configureCurrentTimer() {
  if (savingTimer) {
    timerSaveQueued = true;
    return;
  }
  savingTimer = true;
  const revision = ++timerRevision;
  const target = currentTimer;
  const submitted = {
    pathId: $("path").value || null,
    labelIds: selectedLabelIds(),
    description: $("description").value || null,
  };
  try {
    const updated = await request(
      target ? `/timers/${target.id}` : "/timers/draft",
      {
        method: "PUT",
        body: JSON.stringify({
          ...submitted,
          ...(target ? { startedAt: target.startedAt } : {}),
        }),
      },
    );
    if (revision !== timerRevision) return;
    if (target) {
      showTimer(updated);
      await chrome.storage.local.set({ activeTimer: updated });
    }
    await reconcileSelection(updated || submitted, submitted);
  } finally {
    savingTimer = false;
    if (timerSaveQueued) {
      timerSaveQueued = false;
      await configureCurrentTimer();
    }
  }
}
async function flushDescriptionSave() {
  if (!descriptionSaveTicker) return;
  clearTimeout(descriptionSaveTicker);
  descriptionSaveTicker = null;
  await configureCurrentTimer();
}
async function resetTimerForm() {
  selectionBaseline = { pathId: "", labelIds: [], description: "" };
  $("path").value = "";
  timerLabelIds = [];
  renderTimerLabels();
  $("description").value = "";
  await persistTimerSelection();
}
async function syncTimerState() {
  if (
    liveSyncInFlight ||
    savingTimer ||
    $("toggle").disabled ||
    descriptionSaveTicker
  )
    return;
  liveSyncInFlight = true;
  const revision = timerRevision;
  try {
    const timer = await request("/timers/current");
    if (revision !== timerRevision || savingTimer || descriptionSaveTicker)
      return;
    if (!timer && currentTimer) {
      currentTimer = null;
      await chrome.storage.local.remove("activeTimer");
      showTimer(null);
      const selection = await request("/timers/draft");
      await restoreTimerSelection(selection);
      selectionBaseline = timerSelection(selection);
      await loadSessions();
    } else if (timer && timerStateChanged(currentTimer, timer)) {
      showTimer(timer);
      await chrome.storage.local.set({ activeTimer: timer });
      await reconcileSelection(timer);
      await loadSessions();
    } else if (timer) {
      await reconcileSelection(timer);
    } else if (!timer) {
      const selection = await request("/timers/draft");
      if (revision === timerRevision && !savingTimer && !descriptionSaveTicker)
        await reconcileSelection(selection);
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
function hasOption(select, value) {
  return (
    value && Array.from(select.options).some((option) => option.value === value)
  );
}
function renderLabelChips() {
  const container = $("selected-labels");
  const focusedLabel = document.activeElement?.getAttribute("data-label-id");
  container.replaceChildren();
  const available = KnowCore.timerLabels(
    labels,
    $("path").value,
    timerLabelIds,
  );
  const ordered = labelsExpanded
    ? available
    : [
        ...available.filter((label) => timerLabelIds.includes(label.id)),
        ...available.filter((label) => !timerLabelIds.includes(label.id)),
      ];
  ordered.forEach((label) => {
    const selected = timerLabelIds.includes(label.id);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `label-chip${selected ? " selected" : ""}`;
    chip.setAttribute("aria-pressed", String(selected));
    chip.setAttribute("data-label-id", label.id);
    const text = document.createElement("span");
    text.textContent = labelText(label);
    chip.append(text);
    if (selected) {
      const mark = document.createElement("span");
      mark.textContent = "×";
      mark.setAttribute("aria-hidden", "true");
      chip.append(mark);
    }
    chip.onclick = async () => {
      timerLabelIds = selected
        ? timerLabelIds.filter((id) => id !== label.id)
        : [...timerLabelIds, label.id];
      labelsExpanded = true;
      renderTimerLabels();
      try {
        await configureCurrentTimer();
      } catch (error) {
        $("error").textContent = userError(
          "Could not update the timer.",
          error,
        );
      }
    };
    container.append(chip);
    if (focusedLabel === label.id) chip.focus();
  });
  $("labels-picker").className =
    `labels-picker${labelsExpanded ? " is-open" : ""}`;
  $("labels-toggle").setAttribute("aria-expanded", String(labelsExpanded));
  $("labels-toggle").setAttribute(
    "aria-label",
    labelsExpanded ? "Close session labels" : "Open session labels",
  );
  $("labels-toggle").hidden = !available.length;
  const selectedCount = available.filter((label) =>
    timerLabelIds.includes(label.id),
  ).length;
  $("labels-summary").textContent =
    `${available.length} available${selectedCount ? ` · ${selectedCount} selected` : ""}`;
}

function renderTimerLabels(selectedIds = timerLabelIds) {
  timerLabelIds = [...new Set(selectedIds.filter(Boolean))];
  renderLabelChips();
}
async function restoreTimerSelection(selection) {
  const saved = selection || {};
  const labelIds = saved.labelIds || [];
  $("path").value = hasOption($("path"), saved.pathId) ? saved.pathId : "";
  renderTimerLabels(labelIds);
  $("description").value = saved.description || "";
  await persistTimerSelection();
}

async function reconcileSelection(selection, baseline = selectionBaseline) {
  const next = timerSelection(selection);
  if (
    (next.pathId && !paths.some((path) => path.id === next.pathId)) ||
    next.labelIds.some((id) => !labels.some((label) => label.id === id))
  ) {
    const localPath = $("path").value;
    [paths, labels] = await Promise.all([
      request("/paths"),
      request("/labels?scope=TIME_ENTRY"),
    ]);
    fillPathOptions($("path"), KnowCore.activePaths(paths));
    $("path").value = localPath;
  }
  const resolved = {};
  if (
    document.activeElement !== $("path") &&
    $("path").value === (baseline.pathId || "")
  ) {
    $("path").value = next.pathId;
    resolved.pathId = next.pathId;
  } else resolved.pathId = baseline.pathId;
  if (
    !$("labels-picker").contains(document.activeElement) &&
    JSON.stringify(timerLabelIds) === JSON.stringify(baseline.labelIds || [])
  ) {
    timerLabelIds = [...next.labelIds];
    resolved.labelIds = next.labelIds;
  } else resolved.labelIds = baseline.labelIds;
  if (
    document.activeElement !== $("description") &&
    $("description").value === (baseline.description || "")
  ) {
    $("description").value = next.description;
    resolved.description = next.description;
  } else resolved.description = baseline.description;
  renderTimerLabels();
  selectionBaseline = resolved;
  await persistTimerSelection();
}

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const localDateTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
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
const sessionLabelSummary = (session) =>
  sessionLabelIds(session)
    .map((id) => labelFor(id)?.name || "Removed label")
    .join(", ") || "Unassigned labels";
const sessionDate = (iso) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const duration = (session) =>
  session.running
    ? "Running"
    : KnowCore.formatTimer(session.durationSeconds || 0);
const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left, right) => left.getTime() === right.getTime();
const sessionGroupLabel = (startedAt) => {
  const date = startOfDay(new Date(startedAt));
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  if (date >= thisWeekStart) return "This week";
  if (date >= lastWeekStart) return "Last week";
  if (
    date.getFullYear() === lastMonth.getFullYear() &&
    date.getMonth() === lastMonth.getMonth()
  )
    return "Last month";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
};

function renderSessions(history) {
  const container = $("sessions");
  container.replaceChildren();
  const sessions = history?.sessions || (Array.isArray(history) ? history : []);
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No sessions recorded yet.";
    container.append(empty);
    return;
  }
  const groups = [];
  sessions.forEach((session) => {
    const label = sessionGroupLabel(session.startedAt);
    const group = groups.at(-1);
    if (group?.label === label) group.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  });
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "session-group";
    section.insertAdjacentHTML(
      "beforeend",
      `<h3 class="session-group-heading"><span>${escapeHtml(group.label)}</span><span class="session-group-duration">${KnowCore.formatGroupDuration(group.sessions)}</span></h3>`,
    );
    const list = document.createElement("div");
    list.className = "session-group-list";
    group.sessions.forEach((session) => {
      const article = document.createElement("article");
      article.className = "session-card";
      article.dataset.id = session.id;
      const pathName = pathFor(session.pathId)?.name;
      const labelsMarkup = sessionLabelIds(session)
        .map(
          (id) =>
            `<span>${escapeHtml(labelFor(id)?.name || "Removed label")}</span>`,
        )
        .join("");
      article.insertAdjacentHTML(
        "beforeend",
        `<div class="session-heading"><div>${pathName ? `<h4 class="session-title-chip">${escapeHtml(pathName)}</h4>` : ""}<div class="session-card-labels" aria-label="Session labels">${labelsMarkup}</div>${session.description ? `<p class="session-description">${escapeHtml(session.description)}</p>` : ""}</div><div class="session-actions"><button class="text-button edit-session" aria-label="${session.running ? "Stop timer to edit session" : "Edit session"}" ${session.running ? "disabled" : ""}>${session.running ? "Stop to edit" : "Edit"}</button>${session.running ? "" : '<button class="text-button danger remove-session" aria-label="Remove session">Remove</button>'}</div></div><div class="session-summary"><span>${escapeHtml(duration(session))}</span><span>${escapeHtml(session.source || "SESSION")} · ${escapeHtml(sessionDate(session.startedAt))}</span></div>`,
      );
      list.append(article);
    });
    section.append(list);
    container.append(section);
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
  article.insertAdjacentHTML(
    "beforeend",
    `<form class="session-edit"><label>Description<textarea name="description" rows="2">${escapeHtml(session.description || "")}</textarea></label><div class="session-edit-grid"><label>Path<select name="pathId"><option value="">Unassigned</option>${paths.map((path) => `<option value="${escapeHtml(path.id)}" ${path.id === session.pathId ? "selected" : ""}>${escapeHtml(path.name)}</option>`).join("")}</select></label><label>Labels<select name="labelIds" multiple size="4">${KnowCore.timerLabels(
      labels,
      session.pathId || "",
      selectedIds,
    )
      .map(
        (label) =>
          `<option value="${escapeHtml(label.id)}" ${selectedIds.includes(label.id) ? "selected" : ""}>${escapeHtml(labelText(label))}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Source<select name="source">${["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"].map((source) => `<option ${source === session.source ? "selected" : ""}>${source}</option>`).join("")}</select></label><label>Started<input name="startedAt" type="datetime-local" value="${localDateTime(session.startedAt)}" required></label><label>Ended<input name="endedAt" type="datetime-local" value="${localDateTime(session.endedAt)}" required></label></div><div class="label-actions"><button class="primary" type="submit">Save session</button><button class="text-button cancel-session" type="button">Cancel</button></div></form>`,
  );
  const form = article.querySelector("form");
  form.querySelector('[name="pathId"]').onchange = (event) => {
    const select = form.querySelector('[name="labelIds"]');
    const selected = selectedOptionIds(select);
    fillOptions(
      select,
      "",
      KnowCore.timerLabels(labels, event.target.value, selected),
      selected,
    );
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const start = data.get("startedAt");
    const end = data.get("endedAt");
    if (!start || !end || new Date(start) >= new Date(end)) {
      $("error").textContent = "A session needs a valid start and end time.";
      return;
    }
    try {
      await request(`/time-entries/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          pathId: data.get("pathId") || null,
          labelIds: selectedOptionIds(form.querySelector('[name="labelIds"]')),
          startedAt: isoDateTime(start),
          endedAt: isoDateTime(end),
          description: data.get("description") || null,
          source: data.get("source"),
        }),
      });
      await loadSessions();
    } catch (error) {
      $("error").textContent = userError(
        "Could not update this session.",
        error,
      );
    }
  };
  form.querySelector(".cancel-session").onclick = loadSessions;
}

async function load() {
  setLoading(true);
  try {
    [paths, labels] = await Promise.all([
      request("/paths"),
      request("/labels?scope=TIME_ENTRY"),
    ]);
    const timer = await request("/timers/current");
    fillPathOptions($("path"), KnowCore.activePaths(paths));
    $("path").onchange = chooseExtensionPath;
    if (timer) {
      showTimer(timer);
      await chrome.storage.local.set({ activeTimer: timer });
      await restoreTimerSelection(timerSelection(timer));
      selectionBaseline = timerSelection(timer);
    } else {
      showTimer(null);
      await chrome.storage.local.remove("activeTimer");
      const selection = await request("/timers/draft");
      await restoreTimerSelection(timerSelection(selection));
      selectionBaseline = timerSelection(selection);
    }
    showWorkspace();
    startLiveTimerSync();
    void loadSessions();
  } catch (error) {
    showAuth();
    const fallback = "Sign in failed or the API is unavailable.";
    $("error").textContent =
      errorDetails(error) === "Session expired"
        ? fallback
        : userError(fallback, error);
  }
}
async function login() {
  const button = $("login");
  const email = $("email").value;
  setButtonBusy(button, true);
  timerRevision++;
  try {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: $("password").value }),
    });
    await chrome.storage.local.set({ token: result.token });
    $("error").textContent = "";
    await load();
  } catch (error) {
    $("error").textContent = userError(
      "Check your credentials and API connection, then try again.",
      error,
    );
  } finally {
    setButtonBusy(button, false);
  }
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
        if (chrome.runtime.lastError)
          reject(Error(chrome.runtime.lastError.message));
        else if (!response?.ok)
          reject(Error(response?.error || "Google sign-in failed"));
        else resolve(response);
      });
    });
    $("error").textContent =
      "Complete Google sign-in, then reopen the extension.";
  } catch (error) {
    $("error").textContent = userError(
      "Google sign-in could not be completed. Try again.",
      error,
    );
  } finally {
    setButtonBusy(button, false);
  }
}

$("login").onclick = login;
$("google-login").onclick = googleLogin;
$("logout").onclick = async () => {
  await chrome.storage.local.clear();
  location.reload();
};
$("timer-details").onclick = () => {
  if ($("timer-start-editor").hidden) openTimerStartEditor();
  else closeTimerStartEditor();
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
      body: JSON.stringify({
        pathId: $("path").value || null,
        labelIds: selectedLabelIds($("label")),
        startedAt: isoDateTime(startedAt),
        description: $("description").value || null,
      }),
    });
    showTimer(updated);
    await chrome.storage.local.set({ activeTimer: updated });
    closeTimerStartEditor();
    $("error").textContent = "";
  } catch (error) {
    $("error").textContent = userError(
      "Could not update the timer start.",
      error,
    );
  } finally {
    setButtonBusy(button, false);
  }
};
$("toggle").onclick = async () => {
  timerRevision++;
  const button = $("toggle");
  setButtonBusy(button, true);
  try {
    const current = await request("/timers/current");
    if (KnowCore.timerIsRunning(current)) {
      await flushDescriptionSave();
      await request("/timers/stop", { method: "POST", body: "{}" });
      await chrome.storage.local.remove("activeTimer");
      await resetTimerForm();
      showTimer(null);
      await loadSessions();
    } else {
      const timer = await request("/timers", {
        method: "POST",
        body: JSON.stringify(
          KnowCore.timerStartPayload(
            $("path").value,
            selectedLabelIds($("label")),
            $("description").value,
          ),
        ),
      });
      await persistTimerSelection();
      await chrome.storage.local.set({ activeTimer: timer });
      showTimer(timer);
    }
  } catch (error) {
    $("error").textContent = userError(
      "Could not update the timer. Check the API connection and try again.",
      error,
    );
  } finally {
    setButtonBusy(button, false);
  }
};
$("labels-toggle").onclick = () => {
  labelsExpanded = !labelsExpanded;
  renderTimerLabels();
};
$("labels-picker").onkeydown = (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  labelsExpanded = false;
  renderTimerLabels();
  $("labels-toggle").focus();
};
$("labels-picker").onfocusout = (event) => {
  if (
    event.relatedTarget &&
    !$("labels-picker").contains(event.relatedTarget)
  ) {
    labelsExpanded = false;
    renderTimerLabels();
  }
};
document.addEventListener("pointerdown", (event) => {
  if (labelsExpanded && !$("labels-picker").contains(event.target)) {
    labelsExpanded = false;
    renderTimerLabels();
  }
});
async function createSessionLabel() {
  const name = $("new-label").value.trim();
  if (!name || $("create-label").disabled) return;
  setButtonBusy($("create-label"), true);
  try {
    const created = await request("/labels", {
      method: "POST",
      body: JSON.stringify({ name, scopes: ["TIME_ENTRY"], color: null }),
    });
    labels = [...labels.filter((label) => label.id !== created.id), created];
    timerLabelIds = [...new Set([...timerLabelIds, created.id])];
    $("new-label").value = "";
    renderTimerLabels();
    await configureCurrentTimer();
  } catch (error) {
    $("error").textContent = userError(
      "Could not create the session label.",
      error,
    );
  } finally {
    setButtonBusy($("create-label"), false);
  }
}
$("create-label").onclick = createSessionLabel;
$("new-label").onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void createSessionLabel();
  }
};
$("description").oninput = () => {
  timerRevision++;
  void persistTimerSelection();
  if (descriptionSaveTicker) clearTimeout(descriptionSaveTicker);
  descriptionSaveTicker = setTimeout(async () => {
    descriptionSaveTicker = null;
    try {
      await configureCurrentTimer();
    } catch (error) {
      $("error").textContent = userError("Could not update the timer.", error);
    }
  }, 300);
};
$("sessions").onclick = async (event) => {
  const article = event.target.closest("article");
  if (!article) return;
  const sessionId = article.dataset.id;
  if (event.target.closest(".edit-session")) {
    const history = await request("/time-entries?page=0&size=20");
    const session = (history.sessions || []).find(
      (entry) => entry.id === sessionId,
    );
    if (session) renderSessionEditor(article, session);
  }
  if (
    event.target.closest(".remove-session") &&
    confirm("Remove this session? This cannot be undone.")
  ) {
    try {
      await request(`/time-entries/${sessionId}`, { method: "DELETE" });
      await loadSessions();
    } catch (error) {
      $("error").textContent = userError(
        "Could not remove this session.",
        error,
      );
    }
  }
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
  const enabled =
    $("clockify-import-toggle").getAttribute("aria-checked") !== "true";
  setClockifyImportEnabled(enabled);
  try {
    await chrome.storage.local.set({ [KnowClockifySettings.KEY]: enabled });
  } catch (error) {
    setClockifyImportEnabled(!enabled);
    $("error").textContent = userError(
      "Could not save Clockify import setting.",
      error,
    );
  }
};
$("options").onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.local
  .get(["token", "googleAuthError", KnowClockifySettings.KEY])
  .then(
    ({
      token,
      googleAuthError,
      [KnowClockifySettings.KEY]: clockifyImportEnabled,
    }) => {
      const importEnabled = KnowClockifySettings.isEnabled(
        clockifyImportEnabled,
      );
      setClockifyImportEnabled(importEnabled);
      if (googleAuthError) $("error").textContent = googleAuthError;
      if (token) load();
      else showAuth();
    },
  )
  .catch((error) => {
    showAuth();
    $("error").textContent = userError(
      "Could not read extension session.",
      error,
    );
  });
