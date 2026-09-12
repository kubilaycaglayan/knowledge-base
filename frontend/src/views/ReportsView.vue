<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import { storeToRefs } from "pinia";
import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subYears,
} from "date-fns";
import { api } from "../lib/api";
import { paletteColors } from "../lib/color-palette";
import ReportTabs from "../components/reports/ReportTabs.vue";
import ReportDateRange, {
  type DateRange,
} from "../components/reports/ReportDateRange.vue";
import SummaryBarChart, {
  type TrendlineMode,
} from "../components/reports/SummaryBarChart.vue";
import ProjectDonutChart from "../components/reports/ProjectDonutChart.vue";
import ProjectDurationTable from "../components/reports/ProjectDurationTable.vue";
import { formatDuration } from "../utils/duration";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";
import { useReportsStore } from "../stores/reports";

type Category = { id?: string; label: string; seconds: number };
type CalendarAssignment = {
  id: string;
  label: string;
  color?: string;
  portion?: number | null;
};
type Day = {
  date: string;
  totalSeconds: number;
  paths: Category[];
  sessionLabels: Category[];
  calendarNote?: string | null;
  calendarLabels?: CalendarAssignment[];
};
type CalendarLabel = {
  id: string;
  label: string;
  color?: string;
  days: number;
  markers: number;
};
type SankeyNode = {
  id: string;
  label: string;
  color?: string | null;
  depth: number;
  value: number;
  pathLabel: string;
  bucketLabel: string;
};
type SankeyLink = {
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  value: number;
};
type Sankey = {
  granularity: Aggregation;
  nodes: SankeyNode[];
  links: SankeyLink[];
};
type Report = {
  period: "WEEK" | "MONTH" | "YEAR" | "CUSTOM";
  from: string;
  to: string;
  totalSeconds: number;
  days: Day[];
  paths: Category[];
  sessionLabels: Category[];
  calendarLabels: CalendarLabel[];
  sankey?: Sankey;
};
type PathOption = { id: string; name: string; status?: string };
type LabelOption = { id: string; name: string; color?: string | null };
type Aggregation = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
const PathTimingSankey = defineAsyncComponent(
  () => import("../components/reports/PathTimingSankey.vue"),
);

const today = new Date();
const initialParams = new URLSearchParams(window.location.search);
const requestedStart = initialParams.get("startDate");
const requestedEnd = initialParams.get("endDate");
const selectedRange = ref<DateRange>({
  startDate:
    requestedStart ||
    format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  endDate:
    requestedEnd || format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
});
const aggregationValues: Aggregation[] = [
  "DAY",
  "WEEK",
  "MONTH",
  "QUARTER",
  "YEAR",
];
const trendlineModes: TrendlineMode[] = ["OFF", "LINEAR", "PARABOLIC"];
const requestedAggregation = new URLSearchParams(window.location.search)
  .get("aggregation")
  ?.toUpperCase();
const aggregation = ref<Aggregation>(
  aggregationValues.includes(requestedAggregation as Aggregation)
    ? (requestedAggregation as Aggregation)
    : "DAY",
);
const selectedPathIds = ref<string[]>(initialParams.getAll("pathId"));
const selectedLabelIds = ref<string[]>(initialParams.getAll("labelId"));
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const reportsStore = useReportsStore();
const { paths: availablePaths } = storeToRefs(pathsStore);
const availableLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
const report = ref<Report | null>(null);
const error = ref("");
const loading = ref(false);
let loadSequence = 0;
let activeRequest: AbortController | null = null;
const categories = computed(() => report.value?.paths || []);
const pathOptions = computed<PathOption[]>(() =>
  availablePaths.value.length
    ? availablePaths.value
    : (report.value?.paths || []).flatMap((path) =>
        path.id ? [{ id: path.id, name: path.label }] : [],
      ),
);
const labelOptions = computed<LabelOption[]>(() =>
  availableLabels.value.length
    ? availableLabels.value
    : (report.value?.sessionLabels || []).flatMap((label) =>
        label.id ? [{ id: label.id, name: label.label }] : [],
      ),
);
const breakdownMode = ref<"Path" | "Labels">("Path");
const breakdownCategories = computed(() =>
  breakdownMode.value === "Path"
    ? report.value?.paths || []
    : report.value?.sessionLabels || [],
);
const breakdownLabel = computed(() =>
  breakdownMode.value === "Path" ? "Path" : "Label",
);
const breakdownTotal = computed(() =>
  breakdownCategories.value.reduce((total, category) => total + category.seconds, 0),
);
const days = computed(() =>
  (report.value?.days || []).map((day) => {
    const paths = day.paths.filter((item) =>
      categories.value.some(
        (category) => category.id === item.id || category.label === item.label,
      ),
    );
    return {
      ...day,
      paths,
      totalSeconds: paths.reduce((total, item) => total + item.seconds, 0),
    };
  }),
);
const aggregatedDays = computed(() => {
  const buckets = new Map<string, Day>();
  for (const day of days.value) {
    const date = parseISO(day.date);
    const bucketDate =
      aggregation.value === "DAY"
        ? date
        : aggregation.value === "WEEK"
          ? startOfWeek(date, { weekStartsOn: 1 })
          : aggregation.value === "MONTH"
            ? startOfMonth(date)
            : aggregation.value === "QUARTER"
              ? startOfQuarter(date)
              : startOfYear(date);
    const key = format(bucketDate, "yyyy-MM-dd");
    const bucket = buckets.get(key) || {
      date: key,
      totalSeconds: 0,
      paths: [],
      sessionLabels: [],
      ...(aggregation.value === "DAY"
        ? {
            calendarNote: day.calendarNote,
            calendarLabels: day.calendarLabels,
          }
        : {}),
    };
    bucket.totalSeconds += day.totalSeconds;
    for (const path of day.paths) {
      const existing = bucket.paths.find(
        (item) => item.id === path.id && item.label === path.label,
      );
      if (existing) existing.seconds += path.seconds;
      else bucket.paths.push({ ...path });
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
});
const filteredTotal = computed(() =>
  days.value.reduce(
    (sum, day) =>
      sum + day.paths.reduce((dayTotal, item) => dayTotal + item.seconds, 0),
    0,
  ),
);
const activeDays = computed(
  () => days.value.filter((day) => day.totalSeconds > 0).length,
);
const calendarLogs = computed(() =>
  (report.value?.days || []).filter(
    (day) => day.calendarNote || day.calendarLabels?.length,
  ),
);
const showCalendarInputs = ref(true);
const requestedTrendline = new URLSearchParams(window.location.search)
  .get("trendline")
  ?.toUpperCase() as TrendlineMode;
const trendlineMode = ref<TrendlineMode>(
  trendlineModes.includes(requestedTrendline) ? requestedTrendline : "OFF",
);
const showSankey = ref(
  new URLSearchParams(window.location.search).get("sankey") === "1",
);

function syncSankeyFromUrl() {
  showSankey.value =
    new URLSearchParams(window.location.search).get("sankey") === "1";
}
function syncTrendlineFromUrl() {
  const requested = new URLSearchParams(window.location.search)
    .get("trendline")
    ?.toUpperCase() as TrendlineMode;
  trendlineMode.value = trendlineModes.includes(requested) ? requested : "OFF";
}
function syncReportStateFromUrl() {
  syncSankeyFromUrl();
  syncTrendlineFromUrl();
  const params = new URLSearchParams(window.location.search);
  const nextAggregation = params
    .get("aggregation")
    ?.toUpperCase() as Aggregation;
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const nextPathIds = params.getAll("pathId");
  const nextLabelIds = params.getAll("labelId");
  let changed = false;
  if (
    aggregationValues.includes(nextAggregation) &&
    nextAggregation !== aggregation.value
  ) {
    aggregation.value = nextAggregation;
    changed = true;
  }
  if (
    startDate &&
    endDate &&
    (startDate !== selectedRange.value.startDate ||
      endDate !== selectedRange.value.endDate)
  ) {
    selectedRange.value = { startDate, endDate };
    changed = true;
  }
  if (
    nextPathIds.length !== selectedPathIds.value.length ||
    nextPathIds.some((id, index) => id !== selectedPathIds.value[index])
  ) {
    selectedPathIds.value = nextPathIds;
    changed = true;
  }
  if (
    nextLabelIds.length !== selectedLabelIds.value.length ||
    nextLabelIds.some((id, index) => id !== selectedLabelIds.value[index])
  ) {
    selectedLabelIds.value = nextLabelIds;
    changed = true;
  }
  if (changed) void load();
}
function storeReportState() {
  const url = new URL(window.location.href);
  url.searchParams.set("aggregation", aggregation.value.toLowerCase());
  url.searchParams.set("startDate", selectedRange.value.startDate);
  url.searchParams.set("endDate", selectedRange.value.endDate);
  url.searchParams.delete("pathId");
  selectedPathIds.value.forEach((pathId) => url.searchParams.append("pathId", pathId));
  url.searchParams.delete("labelId");
  selectedLabelIds.value.forEach((labelId) => url.searchParams.append("labelId", labelId));
  window.history.pushState({}, "", url);
}
function toggleTrendline() {
  const next = trendlineModes[
    (trendlineModes.indexOf(trendlineMode.value) + 1) % trendlineModes.length
  ];
  const url = new URL(window.location.href);
  if (next === "OFF") url.searchParams.delete("trendline");
  else url.searchParams.set("trendline", next.toLowerCase());
  window.history.pushState({}, "", url);
  syncTrendlineFromUrl();
}
function toggleSankey() {
  const url = new URL(window.location.href);
  if (showSankey.value) url.searchParams.delete("sankey");
  else url.searchParams.set("sankey", "1");
  window.history.pushState({}, "", url);
  syncSankeyFromUrl();
}

async function load(preserveScroll?: { left: number; top: number }) {
  const sequence = ++loadSequence;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      startDate: selectedRange.value.startDate,
      endDate: selectedRange.value.endDate,
      aggregation: aggregation.value,
    });
    selectedPathIds.value.forEach((pathId) => params.append("pathId", pathId));
    selectedLabelIds.value.forEach((labelId) => params.append("labelId", labelId));
    const cacheKey = params.toString();
    const cached = reportsStore.get<Report>(cacheKey);
    if (cached) {
      report.value = cached;
      selectedRange.value = { startDate: cached.from, endDate: cached.to };
      return;
    }
    const result = await api<Report>(`/reports?${params.toString()}`, {
      signal: controller.signal,
    });
    if (sequence !== loadSequence) return;
    if (
      !result ||
      !Array.isArray(result.days) ||
      !Array.isArray(result.paths) ||
      !Array.isArray(result.calendarLabels)
    )
      throw new Error("Invalid report response");
    report.value = result;
    reportsStore.set(cacheKey, result);
    selectedRange.value = { startDate: result.from, endDate: result.to };
  } catch {
    if (sequence !== loadSequence) return;
    const timedOut = controller.signal.aborted;
    error.value = timedOut
      ? "The report took too long to load."
      : "Unable to load the report. Please try again.";
  } finally {
    window.clearTimeout(timeout);
    if (sequence === loadSequence) {
      loading.value = false;
      activeRequest = null;
      if (preserveScroll) {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            left: preserveScroll.left,
            top: preserveScroll.top,
            behavior: "auto",
          });
        });
      }
    }
  }
}
async function loadPaths() {
  try { await pathsStore.load(); } catch {
    // The report remains usable with paths returned in its aggregate data.
  }
}
async function loadLabels() {
  try { await labelsStore.loadScope("TIME_ENTRY"); } catch {
    // The report remains usable with labels returned in its aggregate data.
  }
}
function selectPaths(value: unknown) {
  selectedPathIds.value = Array.isArray(value)
    ? value.filter((pathId): pathId is string => typeof pathId === "string")
    : [];
  storeReportState();
  void load({ left: window.scrollX, top: window.scrollY });
}
function selectLabels(value: unknown) {
  selectedLabelIds.value = Array.isArray(value)
    ? value.filter((labelId): labelId is string => typeof labelId === "string")
    : [];
  storeReportState();
  void load({ left: window.scrollX, top: window.scrollY });
}
function removePath(pathId: string) {
  selectPaths(selectedPathIds.value.filter((selectedId) => selectedId !== pathId));
}
function removeLabel(labelId: string) {
  selectLabels(selectedLabelIds.value.filter((selectedId) => selectedId !== labelId));
}
function selectAggregation(value: string) {
  aggregation.value = value as Aggregation;
  if (aggregation.value === "DAY") {
    selectedRange.value = {
      startDate: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      endDate: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  } else if (aggregation.value === "WEEK") {
    selectedRange.value = {
      startDate: format(subDays(today, 29), "yyyy-MM-dd"),
      endDate: format(today, "yyyy-MM-dd"),
    };
  } else if (aggregation.value === "MONTH") {
    selectedRange.value = {
      startDate: format(subYears(today, 1), "yyyy-MM-dd"),
      endDate: format(today, "yyyy-MM-dd"),
    };
  } else if (aggregation.value === "QUARTER") {
    selectedRange.value = {
      startDate: format(subYears(today, 2), "yyyy-MM-dd"),
      endDate: format(today, "yyyy-MM-dd"),
    };
  }
  storeReportState();
  void load();
}
function selectRange(value: DateRange) {
  selectedRange.value = value;
  storeReportState();
  void load();
}
function shiftAnchor(amount: number) {
  const span =
    differenceInCalendarDays(
      parseISO(selectedRange.value.endDate),
      parseISO(selectedRange.value.startDate),
    ) + 1;
  selectedRange.value = {
    startDate: format(
      addDays(parseISO(selectedRange.value.startDate), amount * span),
      "yyyy-MM-dd",
    ),
    endDate: format(
      addDays(parseISO(selectedRange.value.endDate), amount * span),
      "yyyy-MM-dd",
    ),
  };
  storeReportState();
  void load();
}
onMounted(() => {
  window.addEventListener("popstate", syncReportStateFromUrl);
  void load();
  void loadPaths();
  void loadLabels();
});
onBeforeUnmount(() =>
  window.removeEventListener("popstate", syncReportStateFromUrl),
);
</script>

<template>
  <section class="reports-page">
    <div class="reports-actions reports-header-actions">
      <ReportDateRange
        :model-value="selectedRange"
        @previous="shiftAnchor(-1)"
        @next="shiftAnchor(1)"
        @update:model-value="selectRange"
      />
    </div>
    <div class="reports-nav">
      <ReportTabs
        :model-value="aggregation"
        @update:model-value="selectAggregation"
      />
      <div class="report-visualization-toggles">
        <button
          v-if="report?.sankey"
          class="ghost sankey-toggle"
          type="button"
          :aria-pressed="showSankey"
          aria-controls="sankey-flow"
          @click="toggleSankey"
        >
          {{ showSankey ? "Show bar chart" : "Show Sankey" }}</button
        ><button
          v-if="calendarLogs.length"
          class="ghost calendar-input-toggle"
          type="button"
          :aria-pressed="showCalendarInputs"
          @click="showCalendarInputs = !showCalendarInputs"
        >
          {{
            showCalendarInputs ? "Hide calendar inputs" : "Show calendar inputs"
          }}
        </button><button
          class="ghost trendline-toggle"
          type="button"
          :aria-pressed="trendlineMode !== 'OFF'"
          :aria-label="`Trendline mode: ${trendlineMode.toLowerCase()}. Activate to show the next mode.`"
          @click="toggleTrendline"
        >
          Trendline: {{ trendlineMode === "OFF" ? "Off" : trendlineMode === "LINEAR" ? "Linear" : "Parabolic" }}
        </button>
      </div>
    </div>
    <p v-if="error" class="notice" role="alert">
      {{ error }}
      <button class="ghost" type="button" @click="load">Try again</button>
    </p>
    <div v-if="loading && !report" class="report-loading" role="status">
      <span class="visually-hidden">Loading report…</span>
      <section class="report-card report-chart-card report-skeleton-card" aria-hidden="true">
        <div class="report-card-heading">
          <div>
            <span class="skeleton-block skeleton-kicker"></span>
            <span class="skeleton-block skeleton-title"></span>
          </div>
          <span class="skeleton-block skeleton-total"></span>
        </div>
        <div class="report-skeleton-chart">
          <span class="skeleton-chart-y skeleton-chart-y-one"></span>
          <span class="skeleton-chart-y skeleton-chart-y-two"></span>
          <div class="skeleton-chart-bars">
            <span v-for="height in [38, 58, 46, 76, 52, 68, 42]" :key="height" class="skeleton-chart-bar" :style="{ height: `${height}%` }"></span>
          </div>
          <div class="skeleton-chart-x">
            <span v-for="label in 7" :key="label" class="skeleton-chart-label"></span>
          </div>
        </div>
      </section>
      <section class="report-card breakdown-card report-skeleton-card" aria-hidden="true">
        <div class="report-skeleton-toolbar">
          <span class="skeleton-block skeleton-filter-label"></span>
          <span class="skeleton-block skeleton-select skeleton-select-wide"></span>
          <span class="skeleton-block skeleton-select skeleton-select-medium"></span>
          <span class="skeleton-block skeleton-select skeleton-select-small"></span>
          <span class="skeleton-block skeleton-active-days"></span>
        </div>
        <div class="breakdown-grid report-skeleton-breakdown">
          <div class="report-skeleton-table">
            <span class="skeleton-block skeleton-table-heading"></span>
            <span v-for="row in 5" :key="row" class="skeleton-table-row">
              <i class="skeleton-block"></i><i class="skeleton-block"></i><i class="skeleton-block"></i>
            </span>
          </div>
          <div class="donut-panel">
            <span class="skeleton-donut"></span>
          </div>
        </div>
      </section>
    </div>
    <template v-else-if="report"
      ><section
        v-if="!showSankey || !report.sankey"
        class="report-card report-chart-card"
      >
        <div class="report-card-heading">
          <div>
            <span class="section-kicker">SUMMARY</span>
            <h2>Tracked time</h2>
          </div>
          <strong class="total-display">{{
            formatDuration(filteredTotal)
          }}</strong>
        </div>
        <SummaryBarChart
          :days="aggregatedDays"
          :categories="categories"
          :aggregation="aggregation"
          :show-calendar="aggregation === 'DAY' && showCalendarInputs"
          :trendline-mode="trendlineMode"
        />
      </section>
      <section
        v-if="showSankey && report.sankey"
        id="sankey-flow"
        class="report-card report-chart-card sankey-card"
        aria-labelledby="sankey-heading"
      >
        <div class="report-card-heading">
          <div>
            <span class="section-kicker">TIME FLOW</span>
            <h2 id="sankey-heading">
              Path timing by {{ report.sankey.granularity.toLowerCase() }}
            </h2>
          </div>
          <span class="muted"
            >{{ report.sankey.links.length }} tracked flows</span
          >
        </div>
        <PathTimingSankey :sankey="report.sankey" />
      </section>
      <section class="report-card breakdown-card">
        <div class="breakdown-toolbar" aria-label="Report filters and grouping">
          <div class="breakdown-control">
            <span class="filter-label">Filter by</span>
            <v-select
              aria-label="Filter by paths"
              :items="pathOptions"
              item-title="name"
              item-value="id"
              :model-value="selectedPathIds"
              multiple
              chips
              closable-chips
              clearable
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Choose paths…"
              @update:model-value="selectPaths"
            >
              <template #chip="{ item }">
                <v-chip
                  :text="item.title"
                  closable
                  close-icon="$close"
                  :aria-label="`Selected path: ${item.title}`"
                  @click:close="removePath(String(item.value))"
                />
              </template>
            </v-select>
          </div>
          <div class="breakdown-control">
            <v-select
              aria-label="Filter by labels"
              :items="labelOptions"
              item-title="name"
              item-value="id"
              :model-value="selectedLabelIds"
              multiple
              chips
              closable-chips
              clearable
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Choose labels…"
              @update:model-value="selectLabels"
            >
              <template #chip="{ item }">
                <v-chip
                  :text="item.title"
                  closable
                  close-icon="$close"
                  :aria-label="`Selected label: ${item.title}`"
                  @click:close="removeLabel(String(item.value))"
                />
              </template>
            </v-select>
          </div>
          <div class="breakdown-control">
            <span>Group by</span>
            <v-select
              aria-label="Group by"
              :items="['Path', 'Labels']"
              v-model="breakdownMode"
              density="compact"
              variant="outlined"
              hide-details
            />
          </div>
          <span class="muted">{{ activeDays }} active days</span>
        </div>
        <div class="breakdown-grid">
          <div>
            <ProjectDurationTable
              :categories="breakdownCategories"
              :category-label="breakdownLabel"
            />
          </div>
          <div class="donut-panel">
            <ProjectDonutChart
              :categories="breakdownCategories"
              :total-seconds="breakdownTotal"
            />
          </div>
        </div>
      </section>
      <section
        v-if="showCalendarInputs && (calendarLogs.length || report.calendarLabels.length)"
        class="report-card calendar-report-card"
      >
        <div class="report-card-heading">
          <div>
            <span class="section-kicker">DAILY RECORDS</span>
            <h2>Calendar log</h2>
          </div>
        </div>
        <ol v-if="calendarLogs.length" class="calendar-report-log">
          <li v-for="day in calendarLogs" :key="day.date">
            <time :datetime="day.date">{{
              format(parseISO(day.date), "EEE, MMM d")
            }}</time>
            <div>
              <p v-if="day.calendarNote">{{ day.calendarNote }}</p>
              <span
                v-for="label in day.calendarLabels"
                :key="label.id"
                class="calendar-log-label"
                :style="{
                  '--calendar-label-color': label.color || paletteColors[1],
                }"
                ><i></i>{{ label.label
                }}<small v-if="label.portion">
                  · {{ label.portion }} day</small
                ></span
              >
            </div>
          </li>
        </ol>
        <div v-if="report.calendarLabels.length" class="calendar-report-labels">
          <div v-for="label in report.calendarLabels" :key="label.id">
            <i :style="{ backgroundColor: label.color || paletteColors[1] }"></i
            ><span>{{ label.label }}</span
            ><strong>{{
              label.days
                ? `${label.days} day${label.days === 1 ? "" : "s"}`
                : `${label.markers} marked day${label.markers === 1 ? "" : "s"}`
            }}</strong>
          </div>
        </div>
      </section></template
    >
    <div v-else-if="!loading" class="empty report-card">
      No report data for this period.
    </div>
  </section>
</template>
