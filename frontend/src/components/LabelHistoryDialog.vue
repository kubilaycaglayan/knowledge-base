<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { mdiArrowLeft, mdiClose } from "@mdi/js";
import { api } from "../lib/api";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";
import LabelHistoryRecords from "./LabelHistoryRecords.vue";

type Bucket = { uses: number; trackedSeconds: number };
export type LabelHistory = {
  labelId: string;
  name: string;
  color?: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  totalUses: number;
  trackedSeconds: number;
  uses: {
    sessions: number;
    logs: number;
    notes: number;
    calendarDays: number;
    cards: number;
  };
  timeline: (Bucket & { month: string })[];
  hours: (Bucket & { hour: number })[];
  related: {
    id: string;
    name: string;
    color?: string | null;
    together: number;
    trackedSeconds: number;
  }[];
};
type Bar = { key: string; label: string; value: number; detail: string };

const props = defineProps<{ labelId: string }>();
const emit = defineEmits<{ close: [] }>();

const fallbackColor = "#2878D5";
const currentId = ref(props.labelId);
const trail = ref<{ id: string; name: string }[]>([]);
const history = ref<LabelHistory | null>(null);
const loading = ref(false);
const error = ref("");
const hoveredTimeline = ref<Bar | null>(null);
const hoveredHour = ref<Bar | null>(null);
let request = 0;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
});
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const hoursNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat();

const hoursOf = (seconds: number) => hoursNumber.format(seconds / 3600);
const plural = (value: number, one: string, many: string) =>
  `${count.format(value)} ${value === 1 ? one : many}`;
const usesText = (value: number) => plural(value, "use", "uses");
const formatDate = (value: string | null) =>
  value ? dateFormat.format(new Date(value)) : "—";
const monthLabel = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return monthFormat.format(new Date(year, index - 1, 1));
};
const hourLabel = (hour: number) =>
  hourFormat.format(new Date(2000, 0, 1, hour));

const color = computed(() => history.value?.color || fallbackColor);
const used = computed(() => (history.value?.totalUses ?? 0) > 0);
// Tracked time is the richer measure; labels never used on sessions fall back
// to counting uses so their charts are not empty.
const byTime = computed(() => (history.value?.trackedSeconds ?? 0) > 0);
const kinds = computed(() => {
  const uses = history.value?.uses;
  if (!uses) return [];
  const parts: [number, string, string][] = [
    [uses.sessions, "session", "sessions"],
    [uses.logs, "log", "logs"],
    [uses.notes, "note", "notes"],
    [uses.calendarDays, "calendar day", "calendar days"],
    [uses.cards, "card", "cards"],
  ];
  return parts
    .filter(([value]) => value > 0)
    .map(([value, one, many]) => plural(value, one, many));
});
const detail = (bucket: Bucket) =>
  `${hoursOf(bucket.trackedSeconds)} h · ${usesText(bucket.uses)}`;
const measure = (bucket: Bucket) =>
  byTime.value ? bucket.trackedSeconds : bucket.uses;
const timelineBars = computed<Bar[]>(() =>
  (history.value?.timeline ?? []).map((bucket) => ({
    key: bucket.month,
    label: monthLabel(bucket.month),
    value: measure(bucket),
    detail: detail(bucket),
  })),
);
const hourBars = computed<Bar[]>(() =>
  (history.value?.hours ?? []).map((bucket) => ({
    key: String(bucket.hour),
    label: hourLabel(bucket.hour),
    value: measure(bucket),
    detail: detail(bucket),
  })),
);
const peak = (bars: Bar[]) =>
  bars.reduce<Bar | null>(
    (best, bar) => (bar.value > (best?.value ?? 0) ? bar : best),
    null,
  );
const timelinePeak = computed(() => peak(timelineBars.value));
const hourPeak = computed(() => peak(hourBars.value));
const barHeight = (bar: Bar, bars: Bar[]) => {
  const max = Math.max(...bars.map((value) => value.value), 0);
  return max ? `${Math.max(2, (bar.value / max) * 100)}%` : "0";
};
const measureName = computed(() => (byTime.value ? "Hours" : "Uses"));

async function load() {
  const id = currentId.value;
  const token = ++request;
  loading.value = true;
  error.value = "";
  hoveredTimeline.value = null;
  hoveredHour.value = null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const result = await api<LabelHistory>(
      `/labels/${id}/history?zone=${encodeURIComponent(zone)}`,
    );
    if (token !== request) return;
    history.value = result;
  } catch {
    if (token !== request) return;
    history.value = null;
    error.value = "Could not load this label’s history.";
  } finally {
    if (token === request) loading.value = false;
  }
}
function openRelated(id: string) {
  if (history.value)
    trail.value.push({ id: history.value.labelId, name: history.value.name });
  currentId.value = id;
}
function back() {
  const previous = trail.value.pop();
  if (previous) currentId.value = previous.id;
}
function close() {
  emit("close");
}
watch(
  () => props.labelId,
  (id) => {
    trail.value = [];
    currentId.value = id;
  },
);
watch(currentId, load, { immediate: true });
</script>

<template>
  <div class="prompt-dialog-backdrop" v-backdrop-close="close">
    <section
      v-dialog-focus
      class="prompt-dialog card label-history-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="label-history-title"
      :aria-busy="loading"
      tabindex="-1"
      @keydown.esc.prevent="close"
    >
      <header class="history-header">
        <button
          v-if="trail.length"
          class="history-icon-button"
          type="button"
          :aria-label="`Back to ${trail.at(-1)?.name}`"
          :title="`Back to ${trail.at(-1)?.name}`"
          @click="back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="mdiArrowLeft" fill="currentColor" />
          </svg>
        </button>
        <div class="history-title">
          <p class="eyebrow">LABEL HISTORY</p>
          <h2 id="label-history-title">
            <span
              class="history-swatch"
              :style="{ backgroundColor: color }"
              aria-hidden="true"
            ></span
            ><span class="history-name">{{
              history?.name ?? "Label history"
            }}</span>
          </h2>
        </div>
        <button
          class="history-icon-button"
          type="button"
          aria-label="Close history"
          title="Close"
          @click="close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="mdiClose" fill="currentColor" />
          </svg>
        </button>
      </header>

      <div v-if="error" class="notice history-error" role="alert">
        <span>{{ error }}</span>
        <button class="ghost history-retry" type="button" @click="load">
          Retry
        </button>
      </div>
      <p v-else-if="loading" class="muted" aria-live="polite">
        Loading history…
      </p>

      <template v-if="history && !error && !loading">
        <p v-if="!used" class="history-empty muted">
          Not used yet. Add this label to a session, log, note, calendar day, or
          card and its history appears here.
        </p>
        <template v-else>
          <dl class="history-stats">
            <div data-test="first-used">
              <dt>First used</dt>
              <dd>
                <time :datetime="history.firstUsedAt ?? undefined">{{
                  formatDate(history.firstUsedAt)
                }}</time>
              </dd>
            </div>
            <div data-test="last-used">
              <dt>Last used</dt>
              <dd>
                <time :datetime="history.lastUsedAt ?? undefined">{{
                  formatDate(history.lastUsedAt)
                }}</time>
              </dd>
            </div>
            <div data-test="total-uses">
              <dt>Uses</dt>
              <dd>{{ count.format(history.totalUses) }}</dd>
            </div>
            <div data-test="tracked-hours">
              <dt>Tracked</dt>
              <dd>{{ hoursOf(history.trackedSeconds) }}&nbsp;h</dd>
            </div>
          </dl>
          <p class="history-kinds muted">{{ kinds.join(" · ") }}</p>

          <figure class="history-chart history-timeline">
            <figcaption>
              <h3>{{ measureName }} per month</h3>
              <span class="history-readout" aria-hidden="true">{{
                hoveredTimeline
                  ? `${hoveredTimeline.label} · ${hoveredTimeline.detail}`
                  : timelinePeak
                    ? `Busiest: ${timelinePeak.label} · ${timelinePeak.detail}`
                    : ""
              }}</span>
            </figcaption>
            <div
              class="history-bars"
              aria-hidden="true"
              @mouseleave="hoveredTimeline = null"
            >
              <div
                v-for="bar in timelineBars"
                :key="bar.key"
                class="history-column"
                :class="{ active: hoveredTimeline?.key === bar.key }"
                @mouseenter="hoveredTimeline = bar"
              >
                <span
                  class="history-bar"
                  :style="{
                    height: barHeight(bar, timelineBars),
                    backgroundColor: color,
                  }"
                ></span>
              </div>
            </div>
            <div class="history-axis" aria-hidden="true">
              <span>{{ timelineBars[0]?.label }}</span>
              <span>{{ timelineBars.at(-1)?.label }}</span>
            </div>
            <div class="visually-hidden">
              <table>
                <caption>
                  Hours and uses per month
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Hours</th>
                    <th scope="col">Uses</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="bucket in history.timeline" :key="bucket.month">
                    <th scope="row">{{ monthLabel(bucket.month) }}</th>
                    <td>{{ hoursOf(bucket.trackedSeconds) }}</td>
                    <td>{{ count.format(bucket.uses) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </figure>

          <figure class="history-chart history-hours">
            <figcaption>
              <h3>{{ measureName }} by hour of day</h3>
              <span class="history-readout" aria-hidden="true">{{
                hoveredHour
                  ? `${hoveredHour.label} · ${hoveredHour.detail}`
                  : hourPeak
                    ? `Busiest: ${hourPeak.label} · ${hourPeak.detail}`
                    : ""
              }}</span>
            </figcaption>
            <div
              class="history-bars"
              aria-hidden="true"
              @mouseleave="hoveredHour = null"
            >
              <div
                v-for="bar in hourBars"
                :key="bar.key"
                class="history-column"
                :class="{ active: hoveredHour?.key === bar.key }"
                @mouseenter="hoveredHour = bar"
              >
                <span
                  class="history-bar"
                  :style="{
                    height: barHeight(bar, hourBars),
                    backgroundColor: color,
                  }"
                ></span>
              </div>
            </div>
            <div class="history-axis" aria-hidden="true">
              <span>{{ hourLabel(0) }}</span>
              <span>{{ hourLabel(12) }}</span>
              <span>{{ hourLabel(23) }}</span>
            </div>
            <div class="visually-hidden">
              <table>
                <caption>
                  Hours and uses by hour of day
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Hour</th>
                    <th scope="col">Hours</th>
                    <th scope="col">Uses</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="bucket in history.hours" :key="bucket.hour">
                    <th scope="row">{{ hourLabel(bucket.hour) }}</th>
                    <td>{{ hoursOf(bucket.trackedSeconds) }}</td>
                    <td>{{ count.format(bucket.uses) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </figure>
        </template>

        <section
          v-if="history.related.length"
          class="history-related"
          aria-labelledby="label-history-related"
        >
          <h3 id="label-history-related">Used together with</h3>
          <ul>
            <li v-for="other in history.related" :key="other.id">
              <button
                type="button"
                :aria-label="`Show history of ${other.name}: ${usesText(other.together)} together`"
                @click="openRelated(other.id)"
              >
                <span
                  class="history-swatch"
                  :style="{ backgroundColor: other.color || fallbackColor }"
                  aria-hidden="true"
                ></span
                ><span class="history-related-name">{{ other.name }}</span
                ><span class="history-related-count"
                  >{{ usesText(other.together)
                  }}<template v-if="other.trackedSeconds">
                    · {{ hoursOf(other.trackedSeconds) }}&nbsp;h</template
                  ></span
                >
              </button>
            </li>
          </ul>
        </section>
        <LabelHistoryRecords :key="history.labelId" :label-id="history.labelId" :uses="history.uses" />
      </template>
    </section>
  </div>
</template>

<style scoped>
.label-history-dialog {
  width: min(600px, 100%);
  display: grid;
  gap: 16px;
}
.label-history-dialog h2,
.label-history-dialog h3,
.label-history-dialog p {
  margin: 0;
}
.history-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.history-title {
  flex: 1;
  min-width: 0;
}
.history-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 20px;
}
.history-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.history-icon-button {
  display: inline-flex;
  flex: none;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--workspace-radius);
  background: transparent;
  color: var(--workspace-muted);
  cursor: pointer;
  touch-action: manipulation;
}
.history-icon-button:hover,
.history-icon-button:focus-visible {
  background: var(--workspace-hover);
  color: var(--workspace-text);
}
.history-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
}
.history-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.history-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.history-stats dt {
  color: var(--workspace-muted);
  font-size: 12px;
}
.history-stats dd {
  margin: 2px 0 0;
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.history-chart {
  display: grid;
  gap: 6px;
  margin: 0;
  position: relative;
}
.history-chart figcaption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.history-chart h3,
.history-related h3 {
  font-size: 14px;
}
.history-readout {
  color: var(--workspace-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.history-bars {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 96px;
  border-bottom: 1px solid var(--workspace-border);
}
.history-column {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-radius: 4px 4px 0 0;
}
.history-column.active {
  background: var(--workspace-hover);
}
.history-bar {
  display: block;
  width: min(100%, 24px);
  border-radius: 4px 4px 0 0;
}
.history-axis {
  display: flex;
  justify-content: space-between;
  color: var(--workspace-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.history-related ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.history-related li {
  min-width: 0;
  max-width: 100%;
}
.history-related button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--workspace-hover);
  color: var(--workspace-text);
  cursor: pointer;
  touch-action: manipulation;
}
.history-related button:hover,
.history-related button:focus-visible {
  background: var(--workspace-selected);
}
.history-related-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.history-related-count {
  color: var(--workspace-muted);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 560px) {
  .history-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .history-related button {
    min-height: 44px;
  }
}
</style>
