<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import PromptDialog from "./PromptDialog.vue";
import { paletteColors } from "../lib/color-palette";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";
import { useTimerStore, type Timer as StoreTimer } from "../stores/timer";
import { useReportsStore } from "../stores/reports";
import { useSessionsStore } from "../stores/sessions";

type Path = { id: string; name: string; status: string };
type Label = { id: string; name: string; color?: string | null; scopes?: ("NOTE" | "CALENDAR" | "TIME_ENTRY")[] };
type Timer = StoreTimer;

const props = defineProps<{ inline?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const { paths } = storeToRefs(pathsStore);
const sessionLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
const timerStore = useTimerStore();
const reportsStore = useReportsStore();
const sessionsStore = useSessionsStore();
const { current: timer } = storeToRefs(timerStore);
const open = ref(Boolean(props.inline)), pathId = ref(""), description = ref(""), newLabel = ref("");
const selectedLabelIds = ref<string[]>([]), recentPathIds = ref<string[]>([]), now = ref(Date.now());
const busy = ref(false), error = ref("");
const timerStartedAt = ref("");
const trackerViewportHeight = ref(0);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
let ticker: number | undefined, syncTicker: number | undefined, reconnectTicker: number | undefined;
let syncInFlight = false, timerStateVersion = 0, socket: WebSocket | undefined;
const socketConnected = ref(false);
let saveQueued = false;
// The tracker form is local to each mounted tracker, while the running timer
// itself lives in Pinia. Track which timer the local form has been hydrated
// from so a route change does not make a fresh form look like a dirty draft.
let formTimerId = "";
function formState() {
  return { pathId: pathId.value, labelIds: [...selectedLabelIds.value], description: description.value, startedAt: timerStartedAt.value };
}
function localStartedAt(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const activePaths = computed(() => paths.value.filter((path) => path.status === "ACTIVE"));
const recentPaths = computed(() => recentPathIds.value.map((id) => paths.value.find((path) => path.id === id)).filter((path): path is Path => Boolean(path && path.status === "ACTIVE")).slice(0, 5));
const elapsed = computed(() => timer.value ? Math.max(0, Math.floor((now.value - Date.parse(timer.value.startedAt)) / 1000)) : 0);
const clock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
const pathName = computed(() => paths.value.find((path) => path.id === (timer.value?.pathId || pathId.value))?.name || "");
const selectedLabelNames = computed(() => selectedLabelIds.value
  .map((id) => sessionLabels.value.find((label) => label.id === id)?.name)
  .filter((name): name is string => Boolean(name)));
const timerSummary = computed(() => selectedLabelIds.value.length ? `${selectedLabelIds.value.length} label${selectedLabelIds.value.length > 1 ? "s" : ""} selected` : "Choose a path or label to begin.");

function rememberPath(id: string) {
  if (!id) return;
  recentPathIds.value = [id, ...recentPathIds.value.filter((value) => value !== id)].slice(0, 5);
  localStorage.setItem("know_recent_timer_paths", JSON.stringify(recentPathIds.value));
}
function updateTrackerViewportHeight() {
  trackerViewportHeight.value = Math.round(window.visualViewport?.height || window.innerHeight);
}
function keepFocusedControlVisible(event: FocusEvent) {
  const control = event.currentTarget;
  if (!(control instanceof HTMLElement)) return;
  window.requestAnimationFrame(() => control.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" }));
}
function applyTimer(value: Timer | null, notifyHistory = false, submitted?: ReturnType<typeof formState>) {
  const previous = timer.value;
  const baseline = submitted || {
    pathId: previous?.pathId || "", labelIds: previous?.labelIds || [],
    description: previous?.description || "", startedAt: previous ? localStartedAt(previous.startedAt) : "",
  };
  const draft = formState();
  const preserveDraft = !previous || previous.id === value?.id;
  if (value && previous?.id === value.id) {
    // Live snapshots may omit fields that did not change. Preserve the
    // existing timer form instead of erasing it with undefined values.
    value = { ...previous, ...value };
  }
  // A completed snapshot is history, not the current running timer. Keep
  // older servers or delayed messages from making the counter appear active.
  if (value?.running === false) value = null;
  timerStore.setCurrent(value);
  now.value = Date.now();
  if (!value) {
    if (!previous) return;
    formTimerId = "";
    pathId.value = "";
    selectedLabelIds.value = [];
    description.value = "";
    timerStartedAt.value = "";
    if (notifyHistory && previous?.running) emit("changed");
    return;
  }
  const newLocalForm = formTimerId !== value.id;
  if (newLocalForm || !preserveDraft || draft.pathId === baseline.pathId) pathId.value = value.pathId || "";
  if (newLocalForm || !preserveDraft || JSON.stringify(draft.labelIds) === JSON.stringify(baseline.labelIds)) selectedLabelIds.value = [...(value.labelIds || [])];
  if (newLocalForm || !preserveDraft || draft.description === baseline.description) description.value = value.description || "";
  if (newLocalForm || !preserveDraft || draft.startedAt === baseline.startedAt) timerStartedAt.value = localStartedAt(value.startedAt);
  formTimerId = value.id;
  rememberPath(value.pathId || "");
}
async function load() {
  const versionAtRequest = timerStateVersion;
  try {
    const [loadedPaths, loadedLabels, current] = await Promise.all([
      pathsStore.load(),
      labelsStore.loadScope("TIME_ENTRY"),
      api<Timer | null>("/timers/current"),
    ]);
    pathsStore.setAll(loadedPaths); labelsStore.setAll(loadedLabels, "TIME_ENTRY");
    if (versionAtRequest === timerStateVersion) applyTimer(current);
  } catch { error.value = "Unable to load the time tracker."; }
}
async function toggleRun() {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try {
    if (timer.value) {
      const versionAtRequest = ++timerStateVersion;
      await api(`/timers/${timer.value.id}/stop`, { method: "POST", body: "{}" });
      reportsStore.clear();
      sessionsStore.clearPages();
      if (versionAtRequest === timerStateVersion) applyTimer(null);
    } else {
      const versionAtRequest = ++timerStateVersion;
      const started = await api<Timer>("/timers", { method: "POST", body: JSON.stringify({ pathId: pathId.value || null, labelIds: selectedLabelIds.value, description: description.value.trim() || null }) });
      if (versionAtRequest === timerStateVersion) applyTimer(started);
      rememberPath(pathId.value);
    }
    emit("changed");
  } catch { error.value = "Could not update the timer. Only one timer can run at a time."; }
  finally { busy.value = false; if (saveQueued) { saveQueued = false; void updateTimer(); } }
}
async function updateTimer(alreadyBusy = false) {
  // Vue event handlers can pass an Event; only the explicit internal flag
  // may reuse createLabel's busy state.
  alreadyBusy = alreadyBusy === true;
  if (!timer.value) return;
  if (busy.value && !alreadyBusy) { saveQueued = true; return; }
  if (!alreadyBusy) busy.value = true;
  const submitted = formState();
  const versionAtRequest = ++timerStateVersion; error.value = "";
  try {
    const startedAt = timerStartedAt.value ? new Date(timerStartedAt.value).toISOString() : timer.value.startedAt;
    const updated = await api<Timer>(`/timers/${timer.value.id}`, { method: "PUT", body: JSON.stringify({ pathId: pathId.value || null, labelIds: selectedLabelIds.value, startedAt, description: description.value.trim() || null }) });
    if (versionAtRequest === timerStateVersion) applyTimer(updated, false, submitted);
    rememberPath(pathId.value);
    emit("changed");
  } catch { error.value = "Could not save the active timer settings."; }
  finally {
    if (!alreadyBusy) {
      busy.value = false;
      if (saveQueued) { saveQueued = false; void updateTimer(); }
    }
  }
}
async function choosePath(id: string) {
  if (id === "__add_new_path__") {
    pathId.value = "";
    const name = (await promptDialog.value?.open("New path name"))?.trim();
    if (!name) return;
    try {
      const created = await api<Path>("/paths", { method: "POST", body: JSON.stringify({ name, description: null, color: paletteColors[6] }) });
      pathsStore.add(created); pathId.value = created.id; rememberPath(created.id);
      if (timer.value) await updateTimer();
    } catch { error.value = "Could not create path."; }
    return;
  }
  pathId.value = id; rememberPath(id); if (timer.value) await updateTimer();
}
async function toggleLabel(id: string) {
  selectedLabelIds.value = selectedLabelIds.value.includes(id) ? selectedLabelIds.value.filter((value) => value !== id) : [...selectedLabelIds.value, id];
  if (timer.value) await updateTimer();
}
async function createLabel() {
  const name = newLabel.value.trim(); if (!name || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const created = await api<Label>("/labels", { method: "POST", body: JSON.stringify({ name, scopes: ["TIME_ENTRY"], color: null }) });
    labelsStore.add({ ...created, scopes: created.scopes || ["TIME_ENTRY"] }); selectedLabelIds.value = [...new Set([...selectedLabelIds.value, created.id])]; newLabel.value = "";
    if (timer.value) await updateTimer(true);
  } catch { error.value = "Could not create the session label."; }
  finally { busy.value = false; if (saveQueued) { saveQueued = false; void updateTimer(); } }
}
async function editStartedAt() {
  if (!timer.value) return;
  const value = await promptDialog.value?.open("Started at", timerStartedAt.value, { inputType: "datetime-local" });
  if (value === null || value === undefined) return;
  if (Number.isNaN(Date.parse(value))) {
    error.value = "Enter a valid date and time.";
    return;
  }
  timerStartedAt.value = value;
  await updateTimer();
}
async function sync() {
  if (syncInFlight || busy.value) return; syncInFlight = true;
  const versionAtRequest = timerStateVersion;
  try {
    const current = await api<Timer | null>("/timers/current");
    if (!busy.value && versionAtRequest === timerStateVersion) applyTimer(current, true);
  } catch { /* Best-effort polling. */ }
  finally { syncInFlight = false; }
}
function websocketUrl() {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  const base = configured ? new URL(configured, window.location.origin) : new URL(window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws/timers";
  base.search = "";
  return base.toString();
}
function startPolling() {
  if (syncTicker) return;
  void sync();
  syncTicker = window.setInterval(() => { void sync(); }, 2000);
}
function stopPolling() {
  if (syncTicker) window.clearInterval(syncTicker);
  syncTicker = undefined;
}
function connectWebSocket() {
  if (socket || !localStorage.getItem("know_token")) return;
  try {
    const candidate = new WebSocket(websocketUrl());
    socket = candidate;
    candidate.onopen = () => {
      candidate.send(JSON.stringify({ type: "AUTH", token: localStorage.getItem("know_token") }));
    };
    candidate.onmessage = (event) => {
      let message: { type?: string; timer?: Timer | null };
      try { message = JSON.parse(event.data) as typeof message; } catch { return; }
      if (message.type === "READY") {
        // Invalidate any poll that was already in flight. The socket is now
        // the authoritative live source; reconciliation is only needed after
        // disconnect/reconnect or app resume.
        timerStateVersion++;
        socketConnected.value = true;
        stopPolling();
      } else if (message.type === "TIMER_STATE") {
        timerStateVersion++;
        applyTimer(message.timer || null, true);
      }
    };
    candidate.onclose = () => {
      if (socket === candidate) socket = undefined;
      socketConnected.value = false;
      startPolling();
      if (!reconnectTicker) reconnectTicker = window.setTimeout(() => {
        reconnectTicker = undefined;
        connectWebSocket();
      }, 5000);
    };
    candidate.onerror = () => candidate.close();
  } catch {
    startPolling();
  }
}
onMounted(() => {
  try { recentPathIds.value = JSON.parse(localStorage.getItem("know_recent_timer_paths") || "[]"); } catch { recentPathIds.value = []; }
  updateTrackerViewportHeight();
  window.visualViewport?.addEventListener("resize", updateTrackerViewportHeight);
  void load(); ticker = window.setInterval(() => { now.value = Date.now(); }, 1000);
  connectWebSocket();
});
onUnmounted(() => {
  window.visualViewport?.removeEventListener("resize", updateTrackerViewportHeight);
  if (ticker) window.clearInterval(ticker);
  stopPolling();
  if (reconnectTicker) window.clearTimeout(reconnectTicker);
  if (socket) { socket.onclose = null; socket.close(); socket = undefined; }
});
</script>

<template>
  <PromptDialog ref="promptDialog" />
  <div class="floating-tracker-host" :class="{ inline: props.inline }" :style="{ '--tracker-viewport-height': `${trackerViewportHeight}px` }">
    <section class="floating-tracker session-grid" aria-label="Focus today">
      <div class="floating-tracker-bar focus">
        <button class="floating-tracker-action primary" :class="{ 'is-running': timer }" type="button" :disabled="busy" :aria-busy="busy" :aria-label="timer ? 'Stop timer' : 'Start timer'" @click="toggleRun"><span class="timer-action-icon" :class="{ stop: timer }" aria-hidden="true"></span><span class="sr-only">{{ timer ? "Stop session" : "Start a session" }}</span></button>
        <button class="floating-tracker-clock" type="button" :disabled="!timer" aria-label="Edit timer start time; elapsed session time" @click="editStartedAt"><strong role="timer" aria-live="off">{{ clock(elapsed) }}</strong></button>
        <span v-if="pathName" class="floating-tracker-path">{{ pathName }}</span>
        <span v-if="!timer" class="floating-tracker-summary">{{ timerSummary }}</span>
        <span v-if="selectedLabelNames.length" class="floating-tracker-context">{{ selectedLabelNames.join(', ') }}</span>
        <button v-if="!props.inline" class="floating-tracker-toggle" type="button" :aria-expanded="open" aria-controls="floating-tracker-panel" @click="open = !open"><span class="sr-only">{{ open ? "Collapse tracker" : "Expand tracker" }}</span><span aria-hidden="true" class="chevron" :class="{ up: !open }"></span></button>
      </div>
      <div v-if="open" id="floating-tracker-panel" class="floating-tracker-panel">
        <div class="tracker-field">
          <label for="tt-path">Path</label>
          <select id="tt-path" v-model="pathId" name="tt-path" autocomplete="off" aria-label="Timer path" @change="choosePath(pathId)"><option value="">Choose a path…</option><option v-for="path in activePaths" :key="path.id" :value="path.id">{{ path.name }}</option><option value="__add_new_path__">＋ Add a new path…</option></select>
          <div v-if="recentPaths.length" class="recent-paths" aria-label="Recently used paths"><span>Recent</span><button v-for="path in recentPaths" :key="path.id" type="button" class="recent-path" :class="{ selected: path.id === pathId }" @click="choosePath(path.id)">{{ path.name }}</button></div>
        </div>
        <div class="tracker-field">
          <div class="tracker-field-heading"><label for="tt-labels">Labels</label><span>{{ sessionLabels.length }} available</span></div>
          <v-select class="tracker-test-select" :items="sessionLabels" item-title="name" item-value="id" :model-value="selectedLabelIds" multiple @update:model-value="(value) => { selectedLabelIds = value || []; updateTimer(); }" />
          <div id="tt-labels" class="label-picker" role="group" aria-label="Session labels"><button v-for="label in sessionLabels" :key="label.id" type="button" :class="{ selected: selectedLabelIds.includes(label.id) }" :aria-pressed="selectedLabelIds.includes(label.id)" @click="toggleLabel(label.id)">{{ label.name }}<span v-if="selectedLabelIds.includes(label.id)" aria-hidden="true">×</span></button></div>
          <div class="new-label-row"><input v-model="newLabel" name="tt-new-label" aria-label="New session label name" autocomplete="off" placeholder="New label for this session…" @focus="keepFocusedControlVisible" @keydown.enter.prevent="createLabel" /><button type="button" class="create-label" :disabled="!newLabel.trim() || busy" @click="createLabel"><span aria-hidden="true">＋</span> Create label</button></div>
        </div>
        <div class="tracker-field tracker-field-wide"><label for="tt-desc">Description <span>(optional)</span></label><textarea id="tt-desc" v-model="description" name="tt-desc" aria-label="Timer description" rows="2" autocomplete="off" placeholder="What are you working on…" @focus="keepFocusedControlVisible" @change="updateTimer"></textarea></div>
        <p v-if="error" class="tracker-error" role="alert" aria-live="polite">{{ error }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.floating-tracker-host { position: fixed; inset-inline: 0; bottom: 0; z-index: 15; display: flex; justify-content: center; pointer-events: none; padding: 0 12px max(12px, env(safe-area-inset-bottom)); }
.floating-tracker-host.inline { position: static; z-index: auto; padding: 0; margin-bottom: 32px; }
.floating-tracker-host.inline .floating-tracker { max-width: none; }
.floating-tracker { width: 100%; max-width: 768px; overflow: hidden; pointer-events: auto; border: 1px solid var(--workspace-border); border-radius: 8px; background: var(--workspace-surface); box-shadow: 0 2px 5px rgb(24 33 47 / 12%), 0 14px 32px rgb(24 33 47 / 22%); }
.floating-tracker-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; }
.floating-tracker-action { display: inline-flex; width: 36px; min-width: 36px; align-items: center; justify-content: center; min-height: 36px; margin: 0 0 0 auto; order: 2; border: 1px solid #4f9b6d; border-radius: 6px; padding: 0; background: #edf8f0; color: #197a43; font-size: 20px; line-height: 1; cursor: pointer; }
.floating-tracker-action:hover { border-color: #197a43; background: #d9f0e0; color: #105d31; }.floating-tracker-action:active { background: #c8e8d1; }.floating-tracker-action:disabled { opacity: .4; cursor: not-allowed; }
.floating-tracker-action.is-running { border-color: var(--workspace-danger-border); background: var(--workspace-danger-surface); color: var(--workspace-danger); }
.floating-tracker-action.is-running:hover { border-color: var(--workspace-danger); background: var(--workspace-danger-surface); color: var(--workspace-danger-hover); }
.floating-tracker-clock { border: 0; padding: 0; background: transparent; color: var(--workspace-text); font: 400 18px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }.floating-tracker-clock:disabled { cursor: default; }
.floating-tracker-path { min-width: 0; max-width: 220px; overflow: hidden; border-radius: 4px; padding: 3px 8px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.floating-tracker-summary { min-width: 0; overflow: hidden; flex: 1; color: var(--workspace-muted); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.floating-tracker-context { display: inline-flex; min-width: 0; max-width: 220px; gap: 6px; overflow: hidden; border-radius: 4px; padding: 3px 8px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.floating-tracker-toggle { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 32px; height: 32px; order: 3; border: 0; border-radius: 6px; background: transparent; color: var(--workspace-muted); }.floating-tracker-toggle:hover { background: var(--workspace-hover); color: var(--workspace-text); }
.chevron { width: 9px; height: 9px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); }.chevron.up { transform: rotate(225deg) translate(-1px, -1px); }
.floating-tracker-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px 12px 12px; border-top: 1px solid var(--workspace-border); }
.tracker-field { display: grid; align-content: start; gap: 8px; min-width: 0; }.tracker-field-wide { grid-column: 1 / -1; }
.tracker-field label, .tracker-field-heading { color: var(--workspace-muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }.tracker-field label span, .tracker-field-heading > span { font-weight: 400; letter-spacing: 0; text-transform: none; }.tracker-field-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.tracker-field select, .tracker-field input, .tracker-field textarea { width: 100%; min-height: 36px; border: 1px solid var(--workspace-control-border); border-radius: 6px; background: var(--workspace-background); color: var(--workspace-text); padding: 7px 9px; font-size: 14px; }.tracker-field textarea { min-height: 56px; resize: vertical; }
.recent-paths { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }.recent-paths > span { color: var(--workspace-muted); font-size: 12px; }.recent-paths button, .label-picker button { border: 0; border-radius: 4px; padding: 4px 8px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; }.recent-paths button:hover, .label-picker button:hover { background: var(--workspace-hover); }.recent-paths button.selected, .label-picker button.selected { background: var(--workspace-accent); color: var(--workspace-on-accent); }
.label-picker { display: flex; min-height: 36px; flex-wrap: wrap; align-items: center; gap: 6px; border: 1px solid var(--workspace-control-border); border-radius: 6px; padding: 6px; background: var(--workspace-background); }.label-picker button { display: inline-flex; align-items: center; gap: 4px; }.label-picker button span { font-size: 15px; line-height: 1; }
.tracker-test-select { display: none; }
.new-label-row { display: flex; align-items: center; gap: 6px; min-width: 0; }.new-label-row input { flex: 1; min-width: 0; }.create-label { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; flex: 0 0 auto; border: 0; border-radius: 6px; padding: 6px 10px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; }.create-label:hover { background: var(--workspace-hover); }.create-label:disabled { opacity: .45; cursor: not-allowed; }
.tracker-error { grid-column: 1 / -1; margin: 0; color: var(--workspace-danger); font-size: 12px; }.timer-action-icon { width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 7px solid currentColor; }.timer-action-icon.stop { width: 8px; height: 8px; border: 0; background: currentColor; }.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 640px) { .floating-tracker-host { padding-inline: 12px; }.floating-tracker-bar { gap: 8px; padding-inline: 10px; }.floating-tracker-action { width: 44px; min-width: 44px; min-height: 44px; }.floating-tracker-toggle { width: 44px; height: 44px; }.floating-tracker-clock { font-size: 16px; }.floating-tracker-panel { grid-template-columns: minmax(0, 1fr); gap: 12px; max-height: calc(var(--tracker-viewport-height, 100dvh) - 24px); min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }.floating-tracker-host.inline .floating-tracker-panel { max-height: none; min-height: auto; overflow: visible; overscroll-behavior: auto; -webkit-overflow-scrolling: auto; }.tracker-field-wide { grid-column: auto; }.floating-tracker-summary { display: none; }.floating-tracker-path, .floating-tracker-context { max-width: 110px; } }
@media (prefers-reduced-motion: reduce) { .floating-tracker, .floating-tracker * { transition: none !important; animation: none !important; } }
</style>
