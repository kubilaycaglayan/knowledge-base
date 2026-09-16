<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { useLogsStore, type Log } from "../stores/logs";
import PromptDialog from "../components/PromptDialog.vue";

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
const openLabelMenuId = ref("");
const savingLabelsId = ref("");
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const composerTextarea = ref<HTMLTextAreaElement | null>(null);
const now = ref(new Date());
const followsBrowserClock = ref(true);
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
  for (const log of logs.value) {
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
function hasLabel(log: Log, labelId: string) {
  return Boolean(log.labelIds?.includes(labelId));
}
async function toggleLogLabel(log: Log, labelId: string) {
  if (savingLabelsId.value === log.id) return;
  savingLabelsId.value = log.id;
  const nextLabelIds = hasLabel(log, labelId)
    ? (log.labelIds || []).filter((id) => id !== labelId)
    : [...(log.labelIds || []), labelId];
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
function closeLabelMenuWhenClickingElsewhere(event: MouseEvent) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest(".log-label-control")
  )
    openLabelMenuId.value = "";
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
    let saved: Log;
    try {
      saved = await api<Log>(`/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...snapshot,
          occurredAt: isoDateTime(snapshot.occurredAt),
          version: log.version,
        }),
      });
    } catch (cause) {
      if (!String(cause).includes("Log changed in another window")) throw cause;
      const latest = await api<Log>(`/logs/${log.id}`);
      saved = await api<Log>(`/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...snapshot,
          occurredAt: isoDateTime(snapshot.occurredAt),
          version: latest.version,
        }),
      });
    }
    logsStore.upsert(saved);
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
  await Promise.all([load(), loadLogLabels()]);
  syncBrowserClock();
  refreshTimer = setInterval(refreshVisibleList, 15000);
  clockTimer = setInterval(syncBrowserClock, 1000);
  window.addEventListener("focus", refreshVisibleList);
  document.addEventListener("click", closeLabelMenuWhenClickingElsewhere);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
  window.removeEventListener("focus", refreshVisibleList);
  document.removeEventListener("click", closeLabelMenuWhenClickingElsewhere);
});
</script>

<template>
  <section class="logs-page">
    <h1 class="sr-only">Logs</h1>
    <PromptDialog ref="promptDialog" />
    <form class="log-composer" autocomplete="off" @submit.prevent="saveNew">
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
    <p v-if="status === 'saved'" class="sr-only" aria-live="polite">
      Log saved.
    </p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="!groupedLogs.length && !error" class="empty">
      No logs yet. Capture a thought above.
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
        :key="log.id"
        class="log-entry"
        :class="logRowClass(group.logs, index)"
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
              :class="{ 'log-label-slot-empty': !logLabels.length }"
              :aria-hidden="logLabels.length ? undefined : 'true'"
            >
              <template v-if="logLabels.length">
                <div class="log-label-control">
                  <button
                    class="log-label-button ghost"
                    :class="{
                      'log-label-button-active': Boolean(log.labelIds?.length),
                    }"
                    type="button"
                    :aria-label="`Choose labels for log from ${formatTimestamp(log.occurredAt)}`"
                    :aria-expanded="openLabelMenuId === log.id"
                    aria-haspopup="dialog"
                    title="Choose log labels"
                    @click="
                      openLabelMenuId = openLabelMenuId === log.id ? '' : log.id
                    "
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M17.63 5.84C17.27 5.33 16.68 5 16 5H5C3.9 5 3 5.9 3 7V17C3 18.1 3.9 19 5 19H16C16.68 19 17.27 18.67 17.63 18.16L22 12L17.63 5.84M16 17H5V7H16L19.55 12L16 17M7.5 9C6.67 9 6 9.67 6 10.5C6 11.33 6.67 12 7.5 12C8.33 12 9 11.33 9 10.5C9 9.67 8.33 9 7.5 9Z"
                      />
                    </svg>
                  </button>
                  <div
                    v-if="openLabelMenuId === log.id"
                    class="log-label-menu card"
                    role="dialog"
                    :aria-label="`Labels for log from ${formatTimestamp(log.occurredAt)}`"
                    @keydown.esc="openLabelMenuId = ''"
                  >
                    <button
                      class="log-label-menu-close ghost"
                      type="button"
                      aria-label="Close log labels"
                      title="Close"
                      @click="openLabelMenuId = ''"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="m6 6 12 12M18 6 6 18" />
                      </svg>
                    </button>
                    <label
                      v-for="label in logLabels"
                      :key="label.id"
                      class="log-label-option"
                      ><input
                        type="checkbox"
                        :checked="hasLabel(log, label.id)"
                        :disabled="savingLabelsId === log.id"
                        @change="toggleLogLabel(log, label.id)"
                      /><span
                        class="label-swatch"
                        :style="{
                          backgroundColor:
                            label.color || 'var(--workspace-accent)',
                        }"
                        aria-hidden="true"
                      ></span
                      ><span>{{ label.name }}</span></label
                    >
                  </div>
                </div>
                <span class="log-actions-separator" aria-hidden="true">|</span>
              </template>
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
  </section>
</template>

<style scoped>
.logs-page {
  max-width: 1200px;
  margin: 0 auto;
}
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
}
.log-label-slot {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 38px;
  min-width: 38px;
}
.log-label-slot-empty {
  visibility: hidden;
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
