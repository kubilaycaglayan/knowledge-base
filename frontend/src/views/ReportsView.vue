<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { api } from "../lib/api";
import ReportTabs from "../components/reports/ReportTabs.vue";
import ReportDateRange, { type DateRange } from "../components/reports/ReportDateRange.vue";
import SummaryBarChart from "../components/reports/SummaryBarChart.vue";
import ProjectDonutChart from "../components/reports/ProjectDonutChart.vue";
import ProjectDurationTable from "../components/reports/ProjectDurationTable.vue";
import { formatDuration } from "../utils/duration";

type Category = { id?: string; label: string; seconds: number };
type Day = { date: string; totalSeconds: number; paths: Category[]; items: Category[] };
type Report = { period: "WEEK" | "MONTH" | "YEAR" | "CUSTOM"; from: string; to: string; totalSeconds: number; days: Day[]; paths: Category[]; items: Category[] };
type ReportPeriod = Report["period"];

const anchor = ref(new Date().toISOString().slice(0, 10));
const today = new Date();
const selectedRange = ref<DateRange>({ startDate: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), endDate: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") });
const period = ref<ReportPeriod>("WEEK");
const report = ref<Report | null>(null);
const error = ref("");
const loading = ref(false);
const categories = computed(() => report.value?.paths || []);
const days = computed(() => (report.value?.days || []).map((day) => {
  const paths = day.paths.filter((item) => categories.value.some((category) => category.id === item.id || category.label === item.label));
  return { ...day, paths, totalSeconds: paths.reduce((total, item) => total + item.seconds, 0) };
}));
const filteredTotal = computed(() => days.value.reduce((sum, day) => sum + day.paths.reduce((dayTotal, item) => dayTotal + item.seconds, 0), 0));
const activeDays = computed(() => days.value.filter((day) => day.totalSeconds > 0).length);

async function load() { loading.value = true; error.value = ""; try { const params = period.value === "CUSTOM" ? new URLSearchParams({ startDate: selectedRange.value.startDate, endDate: selectedRange.value.endDate }) : new URLSearchParams({ period: period.value, anchor: anchor.value }); report.value = await api<Report>(`/reports?${params.toString()}`); selectedRange.value = { startDate: report.value.from, endDate: report.value.to }; } catch { error.value = "Unable to load the report. Please try again."; } finally { loading.value = false; } }
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
onMounted(load);
</script>

<template>
  <section class="reports-page">
    <div class="reports-header"><div><p class="eyebrow">TIME REPORT</p><h1>Reports</h1><p class="lede">Understand where your time goes, project by project.</p></div><div class="reports-actions"><ReportDateRange :model-value="selectedRange" @previous="shiftAnchor(-1)" @next="shiftAnchor(1)" @update:model-value="selectRange" /></div></div>
    <div class="reports-nav"><ReportTabs :model-value="period" @update:model-value="selectPeriod" /></div>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="loading" class="report-loading" role="status">Loading report…</div>
    <template v-else-if="report"><section class="report-card report-chart-card"><div class="report-card-heading"><div><span class="section-kicker">SUMMARY</span><h2>Tracked time</h2></div><strong class="total-display">{{ formatDuration(filteredTotal) }}</strong></div><SummaryBarChart :days="days" :categories="categories" /><div v-if="days.length <= 31" class="chart-day-totals"><span v-for="day in days" :key="day.date">{{ format(parseISO(day.date), "EEE, MMM d") }} <b>{{ formatDuration(day.totalSeconds) }}</b></span></div></section><section class="report-card breakdown-card"><div class="breakdown-toolbar"><span>Group by</span><v-select :items="['Project']" model-value="Project" density="compact" variant="outlined" hide-details /><span class="muted">{{ activeDays }} active days</span></div><div class="breakdown-grid"><div><ProjectDurationTable :categories="categories" :total-seconds="filteredTotal" /></div><div class="donut-panel"><ProjectDonutChart :categories="categories" :total-seconds="filteredTotal" /></div></div></section></template>
    <div v-else-if="!loading" class="empty report-card">No report data for this period.</div>
  </section>
</template>
