<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { api } from "../lib/api";
import { paletteColors } from "../lib/color-palette";
import ReportTabs from "../components/reports/ReportTabs.vue";
import ReportDateRange, { type DateRange } from "../components/reports/ReportDateRange.vue";
import SummaryBarChart from "../components/reports/SummaryBarChart.vue";
import ProjectDonutChart from "../components/reports/ProjectDonutChart.vue";
import ProjectDurationTable from "../components/reports/ProjectDurationTable.vue";
import { formatDuration } from "../utils/duration";

type Category = { id?: string; label: string; seconds: number };
type CalendarAssignment = { id: string; label: string; color?: string; portion?: number | null };
type Day = { date: string; totalSeconds: number; paths: Category[]; sessionLabels: Category[]; calendarNote?: string | null; calendarLabels?: CalendarAssignment[] };
type CalendarLabel = { id: string; label: string; color?: string; days: number; markers: number };
type SankeyNode = { id: string; label: string; color?: string | null };
type SankeyLink = { source: string; target: string; sourceLabel: string; targetLabel: string; value: number };
type Sankey = { granularity: "DAY" | "WEEK" | "MONTH"; nodes: SankeyNode[]; links: SankeyLink[] };
type Report = { period: "WEEK" | "MONTH" | "YEAR" | "CUSTOM"; from: string; to: string; totalSeconds: number; days: Day[]; paths: Category[]; sessionLabels: Category[]; calendarLabels: CalendarLabel[]; sankey?: Sankey };
type ReportPeriod = Report["period"];
const PathTimingSankey = defineAsyncComponent(() => import("../components/reports/PathTimingSankey.vue"));

const anchor = ref(new Date().toISOString().slice(0, 10));
const today = new Date();
const selectedRange = ref<DateRange>({ startDate: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), endDate: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") });
const period = ref<ReportPeriod>("WEEK");
const report = ref<Report | null>(null);
const error = ref("");
const loading = ref(false);
let loadSequence = 0;
let activeRequest: AbortController | null = null;
const categories = computed(() => report.value?.paths || []);
const days = computed(() => (report.value?.days || []).map((day) => {
  const paths = day.paths.filter((item) => categories.value.some((category) => category.id === item.id || category.label === item.label));
  return { ...day, paths, totalSeconds: paths.reduce((total, item) => total + item.seconds, 0) };
}));
const filteredTotal = computed(() => days.value.reduce((sum, day) => sum + day.paths.reduce((dayTotal, item) => dayTotal + item.seconds, 0), 0));
const activeDays = computed(() => days.value.filter((day) => day.totalSeconds > 0).length);
const calendarLogs = computed(() => (report.value?.days || []).filter((day) => day.calendarNote || day.calendarLabels?.length));
const showCalendarInputs = ref(true);
const showSankey = ref(new URLSearchParams(window.location.search).get("sankey") === "1");

function syncSankeyFromUrl() { showSankey.value = new URLSearchParams(window.location.search).get("sankey") === "1"; }
function toggleSankey() {
  const url = new URL(window.location.href);
  if (showSankey.value) url.searchParams.delete("sankey"); else url.searchParams.set("sankey", "1");
  window.history.pushState({}, "", url);
  syncSankeyFromUrl();
}

async function load() {
  const sequence = ++loadSequence;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  loading.value = true;
  error.value = "";
  try {
    const params = period.value === "CUSTOM"
      ? new URLSearchParams({ startDate: selectedRange.value.startDate, endDate: selectedRange.value.endDate })
      : new URLSearchParams({ period: period.value, anchor: anchor.value });
    const result = await api<Report>(`/reports?${params.toString()}`, { signal: controller.signal });
    if (sequence !== loadSequence) return;
    if (!result || !Array.isArray(result.days) || !Array.isArray(result.paths) || !Array.isArray(result.calendarLabels)) throw new Error("Invalid report response");
    report.value = result;
    selectedRange.value = { startDate: result.from, endDate: result.to };
  } catch {
    if (sequence !== loadSequence) return;
    const timedOut = controller.signal.aborted;
    error.value = timedOut ? "The report took too long to load." : "Unable to load the report. Please try again.";
  } finally {
    window.clearTimeout(timeout);
    if (sequence === loadSequence) {
      loading.value = false;
      activeRequest = null;
    }
  }
}
function selectPeriod(value: string) { period.value = value as ReportPeriod; anchor.value = selectedRange.value.startDate; void load(); }
function selectRange(value: DateRange) { selectedRange.value = value; period.value = "CUSTOM"; anchor.value = value.startDate; void load(); }
function shiftAnchor(amount: number) {
  if (period.value === "CUSTOM") {
    const span = differenceInCalendarDays(parseISO(selectedRange.value.endDate), parseISO(selectedRange.value.startDate)) + 1;
    selectedRange.value = { startDate: format(addDays(parseISO(selectedRange.value.startDate), amount * span), "yyyy-MM-dd"), endDate: format(addDays(parseISO(selectedRange.value.endDate), amount * span), "yyyy-MM-dd") };
  } else {
    const current = parseISO(anchor.value);
    const shifted = period.value === "WEEK" ? addWeeks(current, amount) : period.value === "MONTH" ? addMonths(current, amount) : addYears(current, amount);
    anchor.value = format(shifted, "yyyy-MM-dd");
  }
  void load();
}
onMounted(() => { window.addEventListener("popstate", syncSankeyFromUrl); void load(); });
onBeforeUnmount(() => window.removeEventListener("popstate", syncSankeyFromUrl));
</script>

<template>
  <section class="reports-page">
    <div class="reports-header"><div><p class="eyebrow">TIME REPORT</p><h1>Reports</h1><p class="lede">Understand where your time goes, project by project.</p></div><div class="reports-actions"><ReportDateRange :model-value="selectedRange" @previous="shiftAnchor(-1)" @next="shiftAnchor(1)" @update:model-value="selectRange" /></div></div>
    <div class="reports-nav"><ReportTabs :model-value="period" @update:model-value="selectPeriod" /><div class="report-visualization-toggles"><button v-if="report?.sankey" class="ghost sankey-toggle" type="button" :aria-pressed="showSankey" aria-controls="sankey-flow" @click="toggleSankey">{{ showSankey ? "Hide Sankey" : "Show Sankey" }}</button><button v-if="calendarLogs.length" class="ghost calendar-input-toggle" type="button" :aria-pressed="showCalendarInputs" @click="showCalendarInputs = !showCalendarInputs">{{ showCalendarInputs ? "Hide calendar inputs" : "Show calendar inputs" }}</button></div></div>
    <p v-if="error" class="notice" role="alert">{{ error }} <button class="ghost" type="button" @click="load">Try again</button></p>
    <div v-if="loading" class="report-loading" role="status">Loading report…</div>
    <template v-else-if="report"><section class="report-card report-chart-card"><div class="report-card-heading"><div><span class="section-kicker">SUMMARY</span><h2>Tracked time</h2></div><strong class="total-display">{{ formatDuration(filteredTotal) }}</strong></div><SummaryBarChart :days="days" :categories="categories" :show-calendar="showCalendarInputs" /><div v-if="days.length <= 31" class="chart-day-totals"><span v-for="day in days" :key="day.date">{{ format(parseISO(day.date), "EEE, MMM d") }} <b>{{ formatDuration(day.totalSeconds) }}</b></span></div></section><section v-if="showSankey && report.sankey" id="sankey-flow" class="report-card report-chart-card sankey-card" aria-labelledby="sankey-heading"><div class="report-card-heading"><div><span class="section-kicker">TIME FLOW</span><h2 id="sankey-heading">Path timing by {{ report.sankey.granularity.toLowerCase() }}</h2></div><span class="muted">{{ report.sankey.links.length }} tracked flows</span></div><PathTimingSankey :sankey="report.sankey" /><details class="sankey-data"><summary>Read flow values</summary><table><caption class="visually-hidden">Path timing flow values</caption><thead><tr><th scope="col">Period</th><th scope="col">Path</th><th scope="col">Tracked time</th></tr></thead><tbody><tr v-for="link in report.sankey.links" :key="`${link.source}-${link.target}`"><td>{{ link.sourceLabel }}</td><td>{{ link.targetLabel }}</td><td>{{ formatDuration(link.value) }}</td></tr></tbody></table></details></section><section class="report-card breakdown-card"><div class="breakdown-toolbar"><span>Group by</span><v-select aria-label="Group by" :items="['Project']" model-value="Project" density="compact" variant="outlined" hide-details /><span class="muted">{{ activeDays }} active days</span></div><div class="breakdown-grid"><div><ProjectDurationTable :categories="categories" :total-seconds="filteredTotal" /></div><div class="donut-panel"><ProjectDonutChart :categories="categories" :total-seconds="filteredTotal" /></div></div></section><section v-if="showCalendarInputs && calendarLogs.length" class="report-card calendar-report-card"><div class="report-card-heading"><div><span class="section-kicker">DAILY RECORDS</span><h2>Calendar log</h2></div><span class="muted">Separate from tracked work time</span></div><ol class="calendar-report-log"><li v-for="day in calendarLogs" :key="day.date"><time :datetime="day.date">{{ format(parseISO(day.date), "EEE, MMM d") }}</time><div><p v-if="day.calendarNote">{{ day.calendarNote }}</p><span v-for="label in day.calendarLabels" :key="label.id" class="calendar-log-label" :style="{ '--calendar-label-color': label.color || paletteColors[1] }"><i></i>{{ label.label }}<small v-if="label.portion"> · {{ label.portion }} day</small></span></div></li></ol></section><section v-if="showCalendarInputs && report.calendarLabels.length" class="report-card calendar-report-card"><div class="report-card-heading"><div><span class="section-kicker">DAILY RECORDS</span><h2>Calendar labels</h2></div><span class="muted">Separate from tracked work time</span></div><div class="calendar-report-labels"><div v-for="label in report.calendarLabels" :key="label.id"><i :style="{ backgroundColor: label.color || paletteColors[1] }"></i><span>{{ label.label }}</span><strong>{{ label.days ? `${label.days} day${label.days === 1 ? '' : 's'}` : `${label.markers} marked day${label.markers === 1 ? '' : 's'}` }}</strong></div></div></section></template>
    <div v-else-if="!loading" class="empty report-card">No report data for this period.</div>
  </section>
</template>
