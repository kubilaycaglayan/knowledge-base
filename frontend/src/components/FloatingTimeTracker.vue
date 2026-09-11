<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { api } from "../lib/api";

type Path = { id: string; name: string; status: string };
type Label = { id: string; name: string; color?: string | null };
type Timer = { id: string; pathId?: string; labelIds?: string[]; startedAt: string; description?: string; running?: boolean };

const paths = ref<Path[]>([]), labels = ref<Label[]>([]), timer = ref<Timer | null>(null);
const open = ref(true), pathId = ref(""), description = ref(""), newLabel = ref("");
const selectedLabelIds = ref<string[]>([]), recentPathIds = ref<string[]>([]), now = ref(Date.now());
const busy = ref(false), error = ref("");
let ticker: number | undefined, syncTicker: number | undefined, syncInFlight = false;

const activePaths = computed(() => paths.value.filter((path) => path.status === "ACTIVE"));
const recentPaths = computed(() => recentPathIds.value.map((id) => paths.value.find((path) => path.id === id)).filter((path): path is Path => Boolean(path && path.status === "ACTIVE")).slice(0, 5));
const elapsed = computed(() => timer.value ? Math.max(0, Math.floor((now.value - Date.parse(timer.value.startedAt)) / 1000)) : 0);
const clock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
const canStart = computed(() => Boolean(pathId.value) || selectedLabelIds.value.length > 0);
const pathName = computed(() => paths.value.find((path) => path.id === timer.value?.pathId)?.name || "");
const timerSummary = computed(() => timer.value ? timer.value.description || pathName.value || "Session running" : pathName.value || (selectedLabelIds.value.length ? `${selectedLabelIds.value.length} label${selectedLabelIds.value.length > 1 ? "s" : ""} selected` : "Choose a path or label to begin."));

function rememberPath(id: string) {
  if (!id) return;
  recentPathIds.value = [id, ...recentPathIds.value.filter((value) => value !== id)].slice(0, 5);
  localStorage.setItem("know_recent_timer_paths", JSON.stringify(recentPathIds.value));
}
function applyTimer(value: Timer | null) {
  timer.value = value;
  now.value = Date.now();
  if (value) {
    pathId.value = value.pathId || "";
    selectedLabelIds.value = value.labelIds || [];
    description.value = value.description || "";
    rememberPath(value.pathId || "");
  }
}
async function load() {
  try {
    const [loadedPaths, loadedLabels, current] = await Promise.all([
      api<Path[]>("/paths"),
      api<Label[]>("/labels?scope=TIME_ENTRY").then((value) => value ?? api<Label[]>("/calendar/labels")).catch(() => api<Label[]>("/calendar/labels")),
      api<Timer | null>("/timers/current"),
    ]);
    paths.value = loadedPaths; labels.value = loadedLabels; applyTimer(current);
  } catch { error.value = "Unable to load the time tracker."; }
}
async function toggleRun() {
  if (busy.value || (!timer.value && !canStart.value)) return;
  busy.value = true; error.value = "";
  try {
    if (timer.value) {
      await api(`/timers/${timer.value.id}/stop`, { method: "POST", body: "{}" });
      applyTimer(null); description.value = ""; selectedLabelIds.value = [];
    } else {
      applyTimer(await api<Timer>("/timers", { method: "POST", body: JSON.stringify({ pathId: pathId.value || null, labelIds: selectedLabelIds.value, description: description.value.trim() || null }) }));
      rememberPath(pathId.value);
    }
  } catch { error.value = "Could not update the timer. Only one timer can run at a time."; }
  finally { busy.value = false; }
}
async function updateTimer() {
  if (!timer.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    applyTimer(await api<Timer>(`/timers/${timer.value.id}`, { method: "PUT", body: JSON.stringify({ pathId: pathId.value || null, labelIds: selectedLabelIds.value, startedAt: timer.value.startedAt, description: description.value.trim() || null }) }));
    rememberPath(pathId.value);
  } catch { error.value = "Could not save the active timer settings."; }
  finally { busy.value = false; }
}
async function choosePath(id: string) { pathId.value = id; rememberPath(id); if (timer.value) await updateTimer(); }
async function toggleLabel(id: string) {
  selectedLabelIds.value = selectedLabelIds.value.includes(id) ? selectedLabelIds.value.filter((value) => value !== id) : [...selectedLabelIds.value, id];
  if (timer.value) await updateTimer();
}
async function createLabel() {
  const name = newLabel.value.trim(); if (!name || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const created = await api<Label>("/labels", { method: "POST", body: JSON.stringify({ name, scopes: ["TIME_ENTRY"], color: null }) }).catch(() => api<Label>("/calendar/labels", { method: "POST", body: JSON.stringify({ name, color: null }) }));
    labels.value = [...labels.value, created]; selectedLabelIds.value = [...new Set([...selectedLabelIds.value, created.id])]; newLabel.value = "";
    if (timer.value) await updateTimer();
  } catch { error.value = "Could not create the session label."; }
  finally { busy.value = false; }
}
async function sync() {
  if (syncInFlight) return; syncInFlight = true;
  try { applyTimer(await api<Timer | null>("/timers/current")); } catch { /* Best-effort polling. */ }
  finally { syncInFlight = false; }
}
onMounted(() => {
  try { recentPathIds.value = JSON.parse(localStorage.getItem("know_recent_timer_paths") || "[]"); } catch { recentPathIds.value = []; }
  void load(); ticker = window.setInterval(() => { now.value = Date.now(); }, 1000); syncTicker = window.setInterval(() => { void sync(); }, 2000);
});
onUnmounted(() => { if (ticker) window.clearInterval(ticker); if (syncTicker) window.clearInterval(syncTicker); });
</script>

<template>
  <div class="floating-tracker-host">
    <div class="floating-tracker">
      <div class="floating-tracker-bar">
        <button class="floating-tracker-action" type="button" :disabled="busy || (!timer && !canStart)" @click="toggleRun"><span class="timer-action-icon" :class="{ stop: timer }" aria-hidden="true"></span><span>{{ timer ? "Stop" : "Start" }}</span></button>
        <strong class="floating-tracker-clock" role="timer" aria-live="off">{{ clock(elapsed) }}</strong>
        <span class="floating-tracker-summary">{{ timerSummary }}</span>
        <span v-if="selectedLabelIds.length" class="floating-tracker-label-count">{{ selectedLabelIds.length }} label{{ selectedLabelIds.length > 1 ? "s" : "" }}</span>
        <button class="floating-tracker-toggle" type="button" :aria-expanded="open" aria-controls="floating-tracker-panel" @click="open = !open"><span class="sr-only">{{ open ? "Collapse tracker" : "Expand tracker" }}</span><span aria-hidden="true" class="chevron" :class="{ up: !open }"></span></button>
      </div>
      <div v-if="open" id="floating-tracker-panel" class="floating-tracker-panel">
        <div class="tracker-field">
          <label for="tt-path">Path</label>
          <select id="tt-path" v-model="pathId" name="tt-path" autocomplete="off" @change="choosePath(pathId)"><option value="">Choose a path…</option><option v-for="path in activePaths" :key="path.id" :value="path.id">{{ path.name }}</option></select>
          <div v-if="recentPaths.length" class="recent-paths" aria-label="Recently used paths"><span>Recent</span><button v-for="path in recentPaths" :key="path.id" type="button" :class="{ selected: path.id === pathId }" @click="choosePath(path.id)">{{ path.name }}</button></div>
        </div>
        <div class="tracker-field">
          <div class="tracker-field-heading"><label for="tt-labels">Labels</label><span>{{ labels.length }} available</span></div>
          <div id="tt-labels" class="label-picker" role="group" aria-label="Session labels"><button v-for="label in labels" :key="label.id" type="button" :class="{ selected: selectedLabelIds.includes(label.id) }" :aria-pressed="selectedLabelIds.includes(label.id)" @click="toggleLabel(label.id)">{{ label.name }}<span v-if="selectedLabelIds.includes(label.id)" aria-hidden="true">×</span></button></div>
          <div class="new-label-row"><input v-model="newLabel" name="tt-new-label" autocomplete="off" placeholder="New label for this session…" @keydown.enter.prevent="createLabel" /><button type="button" class="create-label" :disabled="!newLabel.trim() || busy" @click="createLabel"><span aria-hidden="true">＋</span> Create</button></div>
        </div>
        <div class="tracker-field tracker-field-wide"><label for="tt-desc">Description <span>(optional)</span></label><textarea id="tt-desc" v-model="description" name="tt-desc" rows="2" autocomplete="off" placeholder="What are you working on…" @change="updateTimer"></textarea></div>
        <p v-if="error" class="tracker-error" role="alert" aria-live="polite">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.floating-tracker-host { position: fixed; inset-inline: 0; bottom: 0; z-index: 15; display: flex; justify-content: center; pointer-events: none; padding: 0 12px max(12px, env(safe-area-inset-bottom)); }
.floating-tracker { width: 100%; max-width: 768px; overflow: hidden; pointer-events: auto; border: 1px solid var(--workspace-border); border-radius: 8px; background: var(--workspace-surface); box-shadow: 0 10px 26px #18212f2e; }
.floating-tracker-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; }
.floating-tracker-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; border: 0; border-radius: 6px; padding: 6px 12px; background: var(--workspace-accent); color: var(--workspace-on-accent); font-size: 14px; font-weight: 600; }
.floating-tracker-action:hover { background: var(--workspace-accent-hover); }.floating-tracker-action:disabled { opacity: .4; cursor: not-allowed; }
.floating-tracker-clock { color: var(--workspace-text); font: 400 18px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
.floating-tracker-summary { min-width: 0; overflow: hidden; flex: 1; color: var(--workspace-muted); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.floating-tracker-label-count { flex: 0 0 auto; border-radius: 4px; padding: 2px 8px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; }
.floating-tracker-toggle { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent; color: var(--workspace-muted); }.floating-tracker-toggle:hover { background: var(--workspace-hover); color: var(--workspace-text); }
.chevron { width: 9px; height: 9px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); }.chevron.up { transform: rotate(225deg) translate(-1px, -1px); }
.floating-tracker-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px 12px 12px; border-top: 1px solid var(--workspace-border); }
.tracker-field { display: grid; align-content: start; gap: 8px; min-width: 0; }.tracker-field-wide { grid-column: 1 / -1; }
.tracker-field label, .tracker-field-heading { color: var(--workspace-muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }.tracker-field label span, .tracker-field-heading > span { font-weight: 400; letter-spacing: 0; text-transform: none; }.tracker-field-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.tracker-field select, .tracker-field input, .tracker-field textarea { width: 100%; min-height: 36px; border: 1px solid var(--workspace-control-border); border-radius: 6px; background: var(--workspace-background); color: var(--workspace-text); padding: 7px 9px; font-size: 14px; }.tracker-field textarea { min-height: 56px; resize: none; }
.recent-paths { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }.recent-paths > span { color: var(--workspace-muted); font-size: 12px; }.recent-paths button, .label-picker button { border: 0; border-radius: 4px; padding: 4px 8px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; }.recent-paths button:hover, .label-picker button:hover { background: var(--workspace-hover); }.recent-paths button.selected, .label-picker button.selected { background: var(--workspace-accent); color: var(--workspace-on-accent); }
.label-picker { display: flex; min-height: 36px; flex-wrap: wrap; align-items: center; gap: 6px; border: 1px solid var(--workspace-control-border); border-radius: 6px; padding: 6px; background: var(--workspace-background); }.label-picker button { display: inline-flex; align-items: center; gap: 4px; }.label-picker button span { font-size: 15px; line-height: 1; }
.new-label-row { display: flex; align-items: center; gap: 6px; min-width: 0; }.new-label-row input { flex: 1; min-width: 0; }.create-label { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; flex: 0 0 auto; border: 0; border-radius: 6px; padding: 6px 10px; background: var(--workspace-selected); color: var(--workspace-selected-text); font-size: 12px; }.create-label:hover { background: var(--workspace-hover); }.create-label:disabled { opacity: .45; cursor: not-allowed; }
.tracker-error { grid-column: 1 / -1; margin: 0; color: var(--workspace-danger); font-size: 12px; }.timer-action-icon { width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 7px solid currentColor; }.timer-action-icon.stop { width: 8px; height: 8px; border: 0; background: currentColor; }.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 640px) { .floating-tracker-host { padding-inline: 12px; }.floating-tracker-bar { gap: 8px; padding-inline: 10px; }.floating-tracker-action { min-height: 44px; }.floating-tracker-toggle { width: 44px; height: 44px; }.floating-tracker-clock { font-size: 16px; }.floating-tracker-panel { grid-template-columns: minmax(0, 1fr); gap: 12px; }.tracker-field-wide { grid-column: auto; }.floating-tracker-summary { font-size: 12px; }.floating-tracker-label-count { display: none; } }
@media (prefers-reduced-motion: reduce) { .floating-tracker, .floating-tracker * { transition: none !important; animation: none !important; } }
</style>
