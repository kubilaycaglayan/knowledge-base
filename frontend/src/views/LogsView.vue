<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { isPageSearchShortcut } from "../lib/search";
import { useLogsStore, type Log } from "../stores/logs";
import PromptDialog from "../components/PromptDialog.vue";
import LabelPicker from "../components/LabelPicker.vue";
import LogDialog from "../components/LogDialog.vue";

type Draft = { body: string; occurredAt: string };
type LogLabel = { id: string; name: string; color?: string | null };
type LogGroup = { label: string; logs: Log[]; dayBreak: boolean };
const logsStore = useLogsStore();
const { logs } = storeToRefs(logsStore);
const body = ref("");
const occurredAt = ref(localDateTime(new Date()));
const editingId = ref("");
const draft = ref<Draft | null>(null);
const error = ref("");
const status = ref<"idle" | "saving" | "saved">("idle");
const savingEdit = ref(false);
const logLabels = ref<LogLabel[]>([]);
const savingLabelsId = ref("");
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const composerTextarea = ref<HTMLTextAreaElement | null>(null);
const now = ref(new Date());
const followsBrowserClock = ref(true);
const searchQuery = ref("");
const searchOpen = ref(false);
const currentPage = ref(1);
const searchInput = ref<HTMLInputElement | null>(null);
const pageSize = 100;
const router = inject(routerKey, undefined);
const route = inject(routeLocationKey, undefined);
// /logs/:id opens one log over the list.
const routeLogId = computed(() => (typeof route?.params.id === "string" ? route.params.id : ""));
const highlightedId = ref("");
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function localDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function isoDateTime(value: string) {
  return new Date(value).toISOString();
}
function resizeComposer(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
function resetComposer() {
  composerTextarea.value?.style.removeProperty("height");
}
function syncBrowserClock() {
  now.value = new Date();
  if (followsBrowserClock.value) occurredAt.value = localDateTime(now.value);
}
function stopFollowingBrowserClock() {
  followsBrowserClock.value = false;
}
function formatTimestamp(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("hour")}:${part("minute")} ${part("day")}:${part("month")}:${part("year")}`;
}
function formatLogTimestamp(value: string, group: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  const time = `${part("hour")}:${part("minute")}`;
  return group === "Last hour" || group === "Today"
    ? time
    : `${part("month")} ${part("day")} ${time}`;
}
const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());
const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
const sameLocalDate = (left: string, right: string) => {
  const a = new Date(left);
  const b = new Date(right);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};
const sameLocalHour = (left: string, right: string) => {
  const a = new Date(left);
  return (
    sameLocalDate(left, right) && a.getHours() === new Date(right).getHours()
  );
};
function groupLabel(value: string) {
  const date = new Date(value);
  const today = startOfDay(now.value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const thisWeek = new Date(today);
  thisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(thisWeek.getDate() - 7);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (date >= new Date(now.value.getTime() - 60 * 60 * 1000))
    return "Last hour";
  if (sameDay(startOfDay(date), today)) return "Today";
  if (sameDay(startOfDay(date), yesterday)) return "Yesterday";
  if (date >= thisWeek) return "This week";
  if (date >= lastWeek) return "Last week";
  if (date >= thisMonth && date < nextMonth) return "This month";
  if (date >= lastMonth && date < thisMonth) return "Last month";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}
const groupedLogs = computed<LogGroup[]>(() => {
  const groups: LogGroup[] = [];
  for (const log of visiblePageLogs.value) {
    const label = groupLabel(log.occurredAt);
    const current = groups.at(-1);
    if (current?.label === label) current.logs.push(log);
    else
      groups.push({
        label,
        logs: [log],
        dayBreak: Boolean(
          current &&
          !sameLocalDate(current.logs.at(-1)!.occurredAt, log.occurredAt),
        ),
      });
  }
  return groups;
});
const matchingLogs = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return logs.value;
  return logs.value.filter((log) => log.body.toLocaleLowerCase().includes(query));
});
const pageCount = computed(() => Math.max(1, Math.ceil(matchingLogs.value.length / pageSize)));
const visiblePageLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return matchingLogs.value.slice(start, start + pageSize);
});
const resultRange = computed(() => {
  if (!matchingLogs.value.length) return "0 results";
  const start = (currentPage.value - 1) * pageSize + 1;
  return `${start}–${Math.min(currentPage.value * pageSize, matchingLogs.value.length)} of ${matchingLogs.value.length}`;
});
function syncUrl() {
  const url = new URL(window.location.href);
  if (searchQuery.value.trim()) url.searchParams.set("q", searchQuery.value.trim());
  else url.searchParams.delete("q");
  if (currentPage.value > 1) url.searchParams.set("page", String(currentPage.value));
  else url.searchParams.delete("page");
  // Keep the router's own history state so Back and Forward still work.
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  searchQuery.value = params.get("q") || "";
  currentPage.value = Math.max(1, Number(params.get("page")) || 1);
}
function setPage(page: number) {
  currentPage.value = Math.min(pageCount.value, Math.max(1, page));
}
function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) requestAnimationFrame(() => searchInput.value?.focus());
  else searchQuery.value = "";
}
// "/" opens the log filter; ⌘K / Ctrl+K belongs to global search.
function onGlobalKeydown(event: KeyboardEvent) {
  if (isPageSearchShortcut(event)) {
    event.preventDefault();
    searchOpen.value = true;
    requestAnimationFrame(() => searchInput.value?.focus());
  }
  if (event.key === "Escape" && searchOpen.value) {
    searchOpen.value = false;
    searchQuery.value = "";
  }
}
function listQuery() {
  return {
    ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
    ...(currentPage.value > 1 ? { page: String(currentPage.value) } : {}),
  };
}
function closeLogDialog() {
  if (router) void router.replace({ path: "/logs", query: listQuery() });
}
/** Leaves the dialog for the log's place in the full list, briefly marked. */
async function showInList(log: Log) {
  searchQuery.value = "";
  searchOpen.value = false;
  await nextTick();
  const index = logs.value.findIndex((value) => value.id === log.id);
  currentPage.value = index < 0 ? 1 : Math.floor(index / pageSize) + 1;
  if (router) await router.replace({ path: "/logs", query: listQuery() });
  await nextTick();
  highlightedId.value = log.id;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => { highlightedId.value = ""; }, 2600);
  const row = document.getElementById(`log-${log.id}`);
  row?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  row?.focus({ preventScroll: true });
}
function logRowClass(logsInGroup: Log[], index: number) {
  const previous = logsInGroup[index - 1];
  if (!previous) return {};
  return {
    "log-hour-break": !sameLocalHour(
      previous.occurredAt,
      logsInGroup[index].occurredAt,
    ),
    "log-day-break": !sameLocalDate(
      previous.occurredAt,
      logsInGroup[index].occurredAt,
    ),
  };
}
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
  try {
    logsStore.setAll(await api<Log[]>("/logs"));
    error.value = "";
  } catch {
    error.value = "Unable to load logs. Please try again.";
  }
}
async function loadLogLabels() {
  try {
    logLabels.value = await api<LogLabel[]>("/labels?scope=LOG");
  } catch {
    error.value = "Unable to load log labels. Please try again.";
  }
}
async function setLogLabels(log: Log, nextLabelIds: string[]) {
  if (savingLabelsId.value === log.id) return;
  savingLabelsId.value = log.id;
  try {
    const saved = await api<Log>(`/logs/${log.id}/labels`, {
      method: "PUT",
      body: JSON.stringify({ labelIds: nextLabelIds }),
    });
    logsStore.replaceLabels(log.id, saved.labelIds);
    error.value = "";
  } catch {
    error.value = "Unable to update this log’s labels. Please try again.";
  } finally {
    savingLabelsId.value = "";
  }
}
async function saveNew() {
  if (status.value === "saving" || !body.value.trim()) return;
  status.value = "saving";
  error.value = "";
  const snapshot = { body: body.value, occurredAt: occurredAt.value };
  try {
    const created = await api<Log>("/logs", {
      method: "POST",
      body: JSON.stringify({
        body: snapshot.body,
        occurredAt: isoDateTime(snapshot.occurredAt),
      }),
    });
    logsStore.upsert(created);
    if (
      body.value === snapshot.body &&
      occurredAt.value === snapshot.occurredAt
    ) {
      body.value = "";
      resetComposer();
      followsBrowserClock.value = true;
      occurredAt.value = localDateTime(new Date());
    }
    status.value = "saved";
  } catch {
    status.value = "idle";
    error.value = "Unable to save log. Please try again.";
  }
}
function startEdit(log: Log) {
  editingId.value = log.id;
  draft.value = {
    body: log.body,
    occurredAt: localDateTime(new Date(log.occurredAt)),
  };
  error.value = "";
}
function cancelEdit() {
  editingId.value = "";
  draft.value = null;
}
async function removeLog(log: Log) {
  const confirmation = await promptDialog.value?.open(
    "Remove this log? This cannot be undone.",
    "",
    { confirmation: true },
  );
  if (confirmation === null || confirmation === undefined) return;
  try {
    await api(`/logs/${log.id}`, { method: "DELETE" });
    logsStore.remove(log.id);
  } catch {
    error.value = "Unable to remove this log. Please try again.";
  }
}
async function saveEdit(log: Log) {
  if (!draft.value?.body.trim() || savingEdit.value) return;
  savingEdit.value = true;
  error.value = "";
  const snapshot = { ...draft.value };
  try {
    await logsStore.save(log, {
      body: snapshot.body,
      occurredAt: isoDateTime(snapshot.occurredAt),
    });
    if (
      draft.value?.body === snapshot.body &&
      draft.value?.occurredAt === snapshot.occurredAt
    )
      cancelEdit();
  } catch {
    error.value =
      "Unable to save this log. Your text is still here; try again.";
  } finally {
    savingEdit.value = false;
  }
}
function refreshVisibleList() {
  if (document.visibilityState === "visible" && !editingId.value) void load();
}
onMounted(async () => {
  readUrl();
  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("popstate", readUrl);
  await Promise.all([load(), loadLogLabels()]);
  syncBrowserClock();
  refreshTimer = setInterval(refreshVisibleList, 15000);
  clockTimer = setInterval(syncBrowserClock, 1000);
  window.addEventListener("focus", refreshVisibleList);
});
watch(searchQuery, () => { currentPage.value = 1; });
watch([searchQuery, currentPage], syncUrl);
watch(pageCount, (count) => { if (currentPage.value > count) currentPage.value = count; });
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
  window.removeEventListener("focus", refreshVisibleList);
  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("popstate", readUrl);
  clearTimeout(highlightTimer);
});
</script>

<template>
  <section class="logs-page">
    <h1 class="sr-only">Logs</h1>
    <PromptDialog ref="promptDialog" />
    <LogDialog
      v-if="routeLogId"
      :log-id="routeLogId"
      :labels="logLabels"
      @close="closeLogDialog"
      @show-in-list="showInList"
      @label-created="logLabels = [...logLabels, $event]"
    />
    <form
      class="log-composer"
      autocomplete="off"
      @keydown.ctrl.enter.prevent="saveNew"
      @keydown.meta.enter.prevent="saveNew"
      @submit.prevent="saveNew"
    >
      <label class="sr-only" for="new-log-body">Log text</label>
      <textarea
        id="new-log-body"
        ref="composerTextarea"
        v-model="body"
        name="body"
        rows="1"
        placeholder="Write a log…"
        @input="resizeComposer"
        @keydown.enter.prevent="saveNew"
      ></textarea>
      <label class="sr-only" for="new-log-time">Log timestamp</label>
      <div class="timestamp-control">
        <input
          id="new-log-time"
          v-model="occurredAt"
          name="occurredAt"
          type="datetime-local"
          aria-label="Log timestamp"
          :class="{ 'timestamp-input-drift': timestampParts.isDrifting }"
          @input="stopFollowingBrowserClock"
        />
        <button
          class="timestamp-reset ghost"
          type="button"
          aria-label="Use browser time"
          title="Use browser time"
          :class="{ 'timestamp-reset-visible': !followsBrowserClock }"
          :disabled="followsBrowserClock"
          @click="resetToBrowserClock"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M4 4v5h5M5.2 9A7 7 0 1 1 6 17" />
          </svg>
        </button>
      </div>
      <button class="primary" type="submit" :disabled="status === 'saving'">
        <span
          v-if="status === 'saving'"
          class="spinner"
          aria-hidden="true"
        ></span
        >Save
      </button>
    </form>
    <div v-if="searchOpen" class="logs-toolbar">
      <div class="logs-search">
        <label class="sr-only" for="logs-search-input">Search all logs</label>
        <input
          id="logs-search-input"
          ref="searchInput"
          v-model="searchQuery"
          name="search"
          type="search"
          aria-keyshortcuts="/"
          placeholder="Search all logs…"
          autocomplete="off"
        />
        <button class="text-button" type="button" @click="toggleSearch">Close</button>
      </div>
    </div>
    <p v-if="status === 'saved'" class="sr-only" aria-live="polite">
      Log saved.
    </p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="!groupedLogs.length && !error" class="empty">
      {{ searchQuery ? 'No logs match this search.' : 'No logs yet. Capture a thought above.' }}
    </div>
    <div
      v-for="group in groupedLogs"
      :key="group.label"
      class="log-group"
      :class="{ 'log-group-day-break': group.dayBreak }"
    >
      <h2 class="log-group-heading">{{ group.label }}</h2>
      <article
        v-for="(log, index) in group.logs"
        :id="`log-${log.id}`"
        :key="log.id"
        class="log-entry"
        :class="[logRowClass(group.logs, index), { 'log-entry-highlight': highlightedId === log.id }]"
        :tabindex="highlightedId === log.id ? -1 : undefined"
      >
        <template v-if="editingId === log.id && draft">
          <input
            v-model="draft.occurredAt"
            class="log-time-input"
            type="datetime-local"
            aria-label="Edit log timestamp"
          />
          <textarea
            v-model="draft.body"
            class="log-body log-edit-body"
            :aria-label="`Edit log text from ${formatTimestamp(log.occurredAt)}`"
            rows="1"
            @keydown.ctrl.enter.prevent="saveEdit(log)"
            @keydown.meta.enter.prevent="saveEdit(log)"
          ></textarea>
          <div class="row-actions">
            <button
              class="primary"
              type="button"
              :disabled="savingEdit"
              @click="saveEdit(log)"
            >
              <span v-if="savingEdit" class="spinner" aria-hidden="true"></span
              >Save</button
            ><button
              class="text-button"
              type="button"
              :disabled="savingEdit"
              @click="cancelEdit"
            >
              Cancel
            </button>
          </div>
        </template>
        <template v-else>
          <time class="log-time" :datetime="log.occurredAt">{{
            formatLogTimestamp(log.occurredAt, group.label)
          }}</time>
          <p class="log-body">{{ log.body }}</p>
          <div class="log-actions">
            <div
              class="log-label-slot"
            >
              <div class="log-label-control">
                <LabelPicker trigger-mode="icon" :model-value="log.labelIds || []" :labels="logLabels" :disabled="savingLabelsId === log.id" :label="`Choose labels for log from ${formatTimestamp(log.occurredAt)}`" @update:model-value="setLogLabels(log, $event)" @label-created="logLabels = [...logLabels, $event]" />
              </div>
              <span class="log-actions-separator" aria-hidden="true">|</span>
            </div>
            <button
              class="log-edit-button ghost"
              type="button"
              :aria-label="`Edit log from ${formatTimestamp(log.occurredAt)}`"
              title="Edit log"
              @click="startEdit(log)"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="m4 16-.7 4.7L8 20l11.3-11.3a2.1 2.1 0 0 0-3-3L5 17Z" />
                <path d="m14.8 7.2 2 2" />
              </svg>
            </button>
            <button
              class="log-remove-button ghost"
              type="button"
              :aria-label="`Remove log from ${formatTimestamp(log.occurredAt)}`"
              title="Remove log"
              @click="removeLog(log)"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </button>
          </div>
        </template>
      </article>
    </div>
    <div v-if="searchOpen" class="logs-bottom-count" aria-live="polite">{{ resultRange }}</div>
    <nav v-if="pageCount > 1" class="logs-pagination" aria-label="Log pages">
      <button class="text-button" type="button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">Previous</button>
      <span>Page {{ currentPage }} of {{ pageCount }}</span>
      <button class="text-button" type="button" :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">Next</button>
    </nav>
  </section>
</template>

<style scoped>
.logs-page {
  max-width: 1200px;
  margin: 0 auto;
}
.log-entry-highlight {
  border-radius: var(--workspace-radius);
  background: var(--workspace-selected);
  box-shadow: 0 0 0 6px var(--workspace-selected);
  transition:
    background-color 600ms ease,
    box-shadow 600ms ease;
}
.log-entry-highlight:focus {
  outline: none;
}
.logs-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -18px 0 18px; }
.logs-search { display: flex; align-items: center; gap: 8px; flex: 1; }
.logs-search input { width: min(100%, 420px); font-size: 16px; }
.logs-result-count { color: var(--workspace-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.logs-bottom-count { margin-top: 20px; color: var(--workspace-muted); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.logs-pagination { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 28px 0; color: var(--workspace-muted); font-variant-numeric: tabular-nums; }
.logs-pagination button { min-height: 40px; }
.log-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  margin: 0 0 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--workspace-border);
}
.log-composer textarea {
  min-height: 40px;
  resize: none;
  overflow: hidden;
}
.timestamp-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.log-composer input {
  width: 190px;
}
.timestamp-input-drift {
  color: #8a6500;
}
.timestamp-reset {
  width: 32px;
  min-height: 40px;
  padding: 7px;
  visibility: hidden;
}
.timestamp-reset-visible {
  visibility: visible;
}
.log-group {
  margin: 28px 0;
}
.log-group-day-break {
  margin-top: 36px;
  padding-top: 16px;
  border-top: 1px solid var(--workspace-border);
}
.log-group-heading {
  margin: 0 0 6px;
  color: var(--workspace-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.log-entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  margin: 0;
  padding: 6px 0;
}
.log-entry.log-hour-break {
  margin-top: 12px;
  padding-top: 10px;
}
.log-entry.log-day-break {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--workspace-border);
}
.log-body {
  align-self: start;
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.log-time {
  position: relative;
  top: 1px;
  align-self: start;
  color: var(--workspace-muted);
  font-size: 12px;
  line-height: 21px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.log-time-input {
  width: 135px;
  min-height: 34px;
  padding: 6px 7px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.log-edit-body {
  width: 100%;
  min-height: 34px;
  resize: vertical;
}
.log-edit-button {
  width: 32px;
  min-height: 32px;
  padding: 6px;
  color: var(--workspace-muted);
  opacity: 0.55;
}
.log-edit-button:hover,
.log-edit-button:focus-visible {
  opacity: 1;
}
.log-label-button {
  width: 32px;
  min-height: 32px;
  padding: 6px;
  color: var(--workspace-muted);
  opacity: 0.7;
}
.log-label-button-active {
  color: var(--workspace-muted);
  opacity: 1;
}
.log-label-button-active svg {
  color: color-mix(in srgb, var(--workspace-text) 85%, #000);
}
.log-label-button:hover,
.log-label-button:focus-visible,
.log-label-button[aria-expanded="true"] {
  color: var(--workspace-accent);
  opacity: 1;
}
.log-label-control {
  position: relative;
  width: 36px;
  min-width: 36px;
  flex: 0 0 36px;
}
.log-label-slot {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 38px;
  min-width: 38px;
}
.log-label-menu {
  position: absolute;
  z-index: 2;
  right: 0;
  top: 36px;
  display: grid;
  gap: 8px;
  min-width: 190px;
  padding: 42px 12px 12px;
  box-shadow: var(--workspace-shadow);
}
.log-label-menu-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  min-height: 32px;
  padding: 0;
  border-color: var(--workspace-accent);
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
  opacity: 1;
}
.log-label-menu-close:hover,
.log-label-menu-close:focus-visible {
  border-color: var(--workspace-accent-hover);
  background: var(--workspace-accent-hover);
  color: var(--workspace-on-accent);
}
.log-actions-separator {
  color: var(--workspace-border);
  font-size: 16px;
  line-height: 1;
}
.log-label-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  font-size: 13px;
}
.log-label-option .label-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.log-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.log-remove-button {
  width: 32px;
  min-height: 32px;
  padding: 6px;
  color: var(--workspace-muted);
  opacity: 0.55;
}
.log-remove-button:hover,
.log-remove-button:focus-visible {
  color: var(--workspace-danger);
  opacity: 1;
}
.row-actions {
  display: flex;
  gap: 8px;
}
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 700px) {
  .log-composer {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .log-composer .timestamp-control {
    grid-column: 1;
    width: 100%;
  }
  .log-composer .timestamp-control input {
    width: 100%;
  }
  .log-composer > button.primary {
    grid-column: 2;
    grid-row: 2;
  }
  .log-entry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 12px;
  }
  .log-entry > .log-time,
  .log-entry > .log-time-input {
    grid-column: 1;
  }
  .log-entry > .log-body {
    grid-column: 2;
  }
  .log-entry > .text-button,
  .log-entry > .row-actions,
  .log-entry > .log-actions {
    grid-column: 2;
    justify-self: start;
  }
  .log-time-input {
    width: 100%;
  }
  .log-entry > .row-actions {
    margin-top: 4px;
  }
}
@media (max-width: 700px) {
  .log-label-menu {
    right: auto;
    left: 0;
    max-width: calc(100vw - 32px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
