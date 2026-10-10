<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { mdiCalendarOutline, mdiClockOutline, mdiNoteTextOutline, mdiTextBoxOutline } from "@mdi/js";
import { api } from "../lib/api";

type Kind = "sessions" | "dates" | "notes" | "logs";
type RecordView = { id: string; date: string; title: string; preview: string };
const props = defineProps<{
  labelId: string;
  uses: { sessions: number; calendarDays: number; notes: number; logs: number };
}>();
const groups = computed(() => [
  { key: "sessions" as const, name: "Sessions", count: props.uses.sessions, icon: mdiClockOutline, fallback: "Untitled session" },
  { key: "dates" as const, name: "Dates", count: props.uses.calendarDays, icon: mdiCalendarOutline, fallback: "Labelled day" },
  { key: "notes" as const, name: "Notes", count: props.uses.notes, icon: mdiNoteTextOutline, fallback: "Untitled note" },
  { key: "logs" as const, name: "Logs", count: props.uses.logs, icon: mdiTextBoxOutline, fallback: "Empty log" },
]);
const kind = ref<Kind>("sessions");
const selected = computed(() => groups.value.find(group => group.key === kind.value)!);
const page = ref(0);
const items = ref<RecordView[]>([]);
const hasMore = ref(false);
const loading = ref(false);
const error = ref("");
const number = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function date(value: string) {
  return value.length === 10
    ? dateFormat.format(new Date(`${value}T12:00:00`))
    : timeFormat.format(new Date(value));
}
function recordHref(item: RecordView) {
  if (kind.value === "dates")
    return `/calendar?date=${encodeURIComponent(item.date.slice(0, 10))}`;
  const base =
    kind.value === "sessions"
      ? "/sessions"
      : kind.value === "notes"
        ? "/notes"
        : "/logs";
  return `${base}/${encodeURIComponent(item.id)}`;
}
let request = 0;
async function load() {
  const token = ++request;
  loading.value = true;
  error.value = "";
  items.value = [];
  hasMore.value = false;
  try {
    const result = await api<{ items: RecordView[]; hasMore: boolean }>(
      `/labels/${props.labelId}/history/records?kind=${kind.value}&page=${page.value}`,
    );
    if (token !== request) return;
    items.value = result?.items ?? [];
    hasMore.value = result?.hasMore ?? false;
  } catch {
    if (token === request) error.value = "Could not load related records.";
  } finally {
    if (token === request) loading.value = false;
  }
}
function select(value: Kind) {
  kind.value = value;
  page.value = 0;
}
watch(() => props.labelId, () => {
  kind.value = groups.value.find(group => group.count > 0)?.key ?? "sessions";
  page.value = 0;
}, { immediate: true, flush: "sync" });
watch(() => [props.labelId, kind.value, page.value], load, { immediate: true });
</script>

<template>
  <section class="history-records" aria-labelledby="history-records-title">
    <div class="records-heading">
      <h3 id="history-records-title">Related records</h3>
      <p>Where this label appears · Newest first</p>
    </div>
    <div class="record-filters" role="group" aria-label="Record type">
      <button v-for="group in groups" :key="group.key" type="button"
        :aria-pressed="kind === group.key" @click="select(group.key)">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path :d="group.icon" fill="currentColor" /></svg>
        {{ group.name }} <span class="record-count">{{ number.format(group.count) }}</span>
      </button>
    </div>
    <div class="records-body" :aria-busy="loading">
      <p v-if="loading" class="records-message" role="status">Loading {{ selected.name.toLowerCase() }}…</p>
      <div v-else-if="error" class="records-message" role="alert">
        {{ error }} <button type="button" class="ghost" @click="load">Retry</button>
      </div>
      <p v-else-if="!items.length" class="records-message" role="status">
        No {{ selected.name.toLowerCase() }} on this page. {{ page ? 'Go back to see earlier results.' : 'Records appear here when you add this label.' }}
      </p>
      <ul v-else :aria-label="selected.name">
        <li v-for="item in items" :key="item.id">
          <span class="record-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24"><path :d="selected.icon" fill="currentColor" /></svg></span>
          <div class="record-copy">
            <time :datetime="item.date">{{ date(item.date) }}</time>
            <p class="record-title">
              <a class="record-link" :href="recordHref(item)">{{ item.title.trim() || selected.fallback }}</a>
            </p>
            <p v-if="kind === 'notes' && item.preview.trim()" class="record-preview">{{ item.preview }}</p>
          </div>
        </li>
      </ul>
    </div>
    <nav v-if="page > 0 || hasMore" class="record-pagination" aria-label="Related records pages">
      <button type="button" class="ghost" :disabled="loading || page === 0" @click="page--">Previous</button>
      <span aria-live="polite">Page {{ number.format(page + 1) }}</span>
      <button type="button" class="ghost" :disabled="loading || !hasMore" @click="page++">Next</button>
    </nav>
  </section>
</template>

<style scoped>
.history-records { border-top: 1px solid var(--workspace-border); padding-top: 20px; display: grid; gap: 14px; min-width: 0; }
.records-heading h3 { margin: 0; font-size: 15px; }
.records-heading p { margin: 4px 0 0; font-size: 12px; color: var(--workspace-muted); }
.record-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.record-filters button { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 6px; border: 1px solid var(--workspace-border); border-radius: 8px; background: var(--workspace-surface); color: var(--workspace-muted); cursor: pointer; touch-action: manipulation; font-size: 12px; }
.record-filters button[aria-pressed="true"] { background: var(--workspace-selected); color: var(--workspace-text); border-color: var(--workspace-muted); font-weight: 600; }
.record-filters button:hover { background: var(--workspace-hover); color: var(--workspace-text); }
.record-count { font-variant-numeric: tabular-nums; }
.records-body { min-height: 100px; border: 1px solid var(--workspace-border); border-radius: 10px; background: var(--workspace-surface); overflow: hidden; }
.records-body ul { list-style: none; margin: 0; padding: 0; }
.records-body li { display: flex; align-items: flex-start; gap: 12px; padding: 14px; }
.records-body li + li { border-top: 1px solid var(--workspace-border); }
.record-icon { display: flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border-radius: 8px; background: var(--workspace-hover); color: var(--workspace-muted); }
.record-copy { min-width: 0; }
.record-copy time { color: var(--workspace-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.record-title { margin: 4px 0 0; font-size: 13px; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-link { color: inherit; text-decoration: underline; text-decoration-color: var(--workspace-border); text-underline-offset: 3px; }
.record-link:hover, .record-link:focus-visible { color: var(--workspace-text); text-decoration-color: currentColor; }
.record-preview { margin: 5px 0 0; color: var(--workspace-muted); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.records-message { padding: 20px; margin: 0; color: var(--workspace-muted); font-size: 13px; }
.record-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
.record-pagination button { min-height: 44px; touch-action: manipulation; }
@media (max-width: 560px) { .record-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
