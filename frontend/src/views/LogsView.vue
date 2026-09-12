<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { useLogsStore, type Log } from "../stores/logs";

type Draft = { body: string; occurredAt: string };
type LogGroup = { label: string; logs: Log[] };
const logsStore = useLogsStore();
const { logs } = storeToRefs(logsStore);
const body = ref("");
const occurredAt = ref(localDateTime(new Date()));
const editingId = ref("");
const draft = ref<Draft | null>(null);
const error = ref("");
const status = ref<"idle" | "saving" | "saved">("idle");
const savingEdit = ref(false);
const now = ref(new Date());
const followsBrowserClock = ref(true);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function localDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function isoDateTime(value: string) { return new Date(value).toISOString(); }
function resizeComposer(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
function syncBrowserClock() {
  now.value = new Date();
  if (followsBrowserClock.value) occurredAt.value = localDateTime(now.value);
}
function stopFollowingBrowserClock() { followsBrowserClock.value = false; }
function formatTimestamp(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("hour")}:${part("minute")} ${part("day")}:${part("month")}:${part("year")}`;
}
function formatLogTimestamp(value: string, group: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  const time = `${part("hour")}:${part("minute")}`;
  return group === "Last hour" || group === "Today" ? time : `${part("month")} ${part("day")} ${time}`;
}
const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
function groupLabel(value: string) {
  const date = new Date(value);
  const today = startOfDay(now.value);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const thisWeek = new Date(today); thisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastWeek = new Date(thisWeek); lastWeek.setDate(thisWeek.getDate() - 7);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (date >= new Date(now.value.getTime() - 60 * 60 * 1000)) return "Last hour";
  if (sameDay(startOfDay(date), today)) return "Today";
  if (sameDay(startOfDay(date), yesterday)) return "Yesterday";
  if (date >= thisWeek) return "This week";
  if (date >= lastWeek) return "Last week";
  if (date >= thisMonth && date < nextMonth) return "This month";
  if (date >= lastMonth && date < thisMonth) return "Last month";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}
const groupedLogs = computed<LogGroup[]>(() => {
  const groups: LogGroup[] = [];
  for (const log of logs.value) {
    const label = groupLabel(log.occurredAt);
    const current = groups.at(-1);
    if (current?.label === label) current.logs.push(log);
    else groups.push({ label, logs: [log] });
  }
  return groups;
});
const timestampParts = computed(() => {
  const selected = new Date(occurredAt.value);
  const current = now.value;
  return {
    isDrifting: Math.abs(selected.getTime() - current.getTime()) > 60 * 1000,
  };
});
function resetToBrowserClock() {
  followsBrowserClock.value = true;
  syncBrowserClock();
}
async function load() {
  try { logsStore.setAll(await api<Log[]>("/logs")); error.value = ""; }
  catch { error.value = "Unable to load logs. Please try again."; }
}
async function saveNew() {
  if (status.value === "saving" || !body.value.trim()) return;
  status.value = "saving"; error.value = "";
  const snapshot = { body: body.value, occurredAt: occurredAt.value };
  try {
    const created = await api<Log>("/logs", { method: "POST", body: JSON.stringify({ body: snapshot.body, occurredAt: isoDateTime(snapshot.occurredAt) }) });
    logsStore.upsert(created);
    if (body.value === snapshot.body && occurredAt.value === snapshot.occurredAt) { body.value = ""; followsBrowserClock.value = true; occurredAt.value = localDateTime(new Date()); }
    status.value = "saved";
  } catch { status.value = "idle"; error.value = "Unable to save log. Please try again."; }
}
function startEdit(log: Log) { editingId.value = log.id; draft.value = { body: log.body, occurredAt: localDateTime(new Date(log.occurredAt)) }; error.value = ""; }
function cancelEdit() { editingId.value = ""; draft.value = null; }
async function saveEdit(log: Log) {
  if (!draft.value?.body.trim() || savingEdit.value) return;
  savingEdit.value = true; error.value = "";
  const snapshot = { ...draft.value };
  try {
    let saved: Log;
    try { saved = await api<Log>(`/logs/${log.id}`, { method: "PUT", body: JSON.stringify({ ...snapshot, occurredAt: isoDateTime(snapshot.occurredAt), version: log.version }) }); }
    catch (cause) {
      if (!String(cause).includes("Log changed in another window")) throw cause;
      const latest = await api<Log>(`/logs/${log.id}`);
      saved = await api<Log>(`/logs/${log.id}`, { method: "PUT", body: JSON.stringify({ ...snapshot, occurredAt: isoDateTime(snapshot.occurredAt), version: latest.version }) });
    }
    logsStore.upsert(saved);
    if (draft.value?.body === snapshot.body && draft.value?.occurredAt === snapshot.occurredAt) cancelEdit();
  } catch { error.value = "Unable to save this log. Your text is still here; try again."; }
  finally { savingEdit.value = false; }
}
function refreshVisibleList() { if (document.visibilityState === "visible" && !editingId.value) void load(); }
onMounted(async () => { await load(); syncBrowserClock(); refreshTimer = setInterval(refreshVisibleList, 15000); clockTimer = setInterval(syncBrowserClock, 1000); window.addEventListener("focus", refreshVisibleList); });
onBeforeUnmount(() => { if (refreshTimer) clearInterval(refreshTimer); if (clockTimer) clearInterval(clockTimer); window.removeEventListener("focus", refreshVisibleList); });
</script>

<template>
  <section class="logs-page">
    <h1 class="sr-only">Logs</h1>
    <form class="log-composer" autocomplete="off" @submit.prevent="saveNew">
      <label class="sr-only" for="new-log-body">Log text</label>
      <textarea id="new-log-body" v-model="body" name="body" rows="1" placeholder="Write a log…" @input="resizeComposer" @keydown.enter.prevent="saveNew"></textarea>
      <label class="sr-only" for="new-log-time">Log timestamp</label>
      <div class="timestamp-control">
        <input id="new-log-time" v-model="occurredAt" name="occurredAt" type="datetime-local" aria-label="Log timestamp" :class="{ 'timestamp-input-drift': timestampParts.isDrifting }" @input="stopFollowingBrowserClock" />
        <button class="timestamp-reset ghost" type="button" aria-label="Use browser time" title="Use browser time" :class="{ 'timestamp-reset-visible': !followsBrowserClock }" :disabled="followsBrowserClock" @click="resetToBrowserClock">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4v5h5M5.2 9A7 7 0 1 1 6 17" /></svg>
        </button>
      </div>
      <button class="primary" type="submit" :disabled="status === 'saving'"><span v-if="status === 'saving'" class="spinner" aria-hidden="true"></span>Save</button>
    </form>
    <p v-if="status === 'saved'" class="sr-only" aria-live="polite">Log saved.</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="!groupedLogs.length && !error" class="empty">No logs yet. Capture a thought above.</div>
    <div v-for="group in groupedLogs" :key="group.label" class="log-group">
      <h2 class="log-group-heading">{{ group.label }}</h2>
      <article v-for="log in group.logs" :key="log.id" class="log-entry">
        <template v-if="editingId === log.id && draft">
          <textarea v-model="draft.body" :aria-label="`Edit log text from ${formatTimestamp(log.occurredAt)}`" rows="2"></textarea>
          <div class="log-edit-row">
            <label>Timestamp <input v-model="draft.occurredAt" type="datetime-local" aria-label="Edit log timestamp" /></label>
            <div class="row-actions"><button class="primary" type="button" :disabled="savingEdit" @click="saveEdit(log)"><span v-if="savingEdit" class="spinner" aria-hidden="true"></span>Save</button><button class="text-button" type="button" :disabled="savingEdit" @click="cancelEdit">Cancel</button></div>
          </div>
        </template>
        <template v-else>
          <time class="log-time" :datetime="log.occurredAt">{{ formatLogTimestamp(log.occurredAt, group.label) }}</time>
          <p class="log-body">{{ log.body }}</p>
          <button class="text-button" type="button" :aria-label="`Edit log from ${formatTimestamp(log.occurredAt)}`" @click="startEdit(log)">Edit</button>
        </template>
      </article>
    </div>
  </section>
</template>

<style scoped>
.logs-page { max-width: 1200px; margin: 0 auto; }
.log-composer { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; margin: 0 0 32px; padding-bottom: 16px; border-bottom: 1px solid var(--workspace-border); }
.log-composer textarea { min-height: 40px; resize: none; overflow: hidden; }
.timestamp-control { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.log-composer input { width: 190px; }
.timestamp-input-drift { color: #8a6500; }
.timestamp-reset { width: 32px; min-height: 40px; padding: 7px; visibility: hidden; }
.timestamp-reset-visible { visibility: visible; }
.log-group { margin: 28px 0; }
.log-group-heading { margin: 0 0 10px; color: var(--workspace-muted); font-size: 12px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
.log-entry { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 20px; margin: 0; padding: 16px 0; border-bottom: 1px solid var(--workspace-border); }
.log-body { min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.log-time { color: var(--workspace-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.log-edit-row { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: 16px; }
.log-edit-row > label { display: grid; gap: 4px; color: var(--workspace-muted); font-size: 12px; }
.log-edit-row input { width: 190px; }
.log-entry > textarea { flex: 1; }
.row-actions { display: flex; gap: 8px; }
.spinner { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 700px) { .log-composer { grid-template-columns: minmax(0, 1fr) auto; } .log-composer .timestamp-control { grid-column: 1; width: 100%; } .log-composer .timestamp-control input { width: 100%; } .log-composer > button.primary { grid-column: 2; grid-row: 2; } .log-entry { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; } .log-entry > .log-time { grid-column: 1; } .log-entry > .log-body { grid-column: 2; } .log-entry > .text-button { grid-column: 2; justify-self: start; } .log-edit-row { display: block; } .log-edit-row input { width: 100%; } .log-edit-row .row-actions { margin-top: 12px; } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
