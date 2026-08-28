<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { format, parseISO } from "date-fns";
import { api } from "../lib/api";
import ReportTabs from "../components/reports/ReportTabs.vue";
import ReportDateRange from "../components/reports/ReportDateRange.vue";
import ReportFilters, { type ReportFiltersModel } from "../components/reports/ReportFilters.vue";
import SummaryBarChart from "../components/reports/SummaryBarChart.vue";
import ProjectDonutChart from "../components/reports/ProjectDonutChart.vue";
import ProjectDurationTable from "../components/reports/ProjectDurationTable.vue";
import { formatDuration } from "../utils/duration";
import type { ReportQuery } from "../utils/reportQuery";

type Category = { id?: string; label: string; seconds: number };
type Day = { date: string; totalSeconds: number; paths: Category[]; items: Category[] };
type Report = { period: "WEEK" | "MONTH" | "YEAR"; from: string; to: string; totalSeconds: number; days: Day[]; paths: Category[]; items: Category[] };

const reportType = ref("Summary");
const anchor = ref(new Date().toISOString().slice(0, 10));
const report = ref<Report | null>(null);
const error = ref("");
const loading = ref(false);
const appliedFilters = ref<ReportFiltersModel>({ team: "", client: "", project: "", task: "", tag: "", description: "" });
const draftFilters = ref<ReportFiltersModel>({ ...appliedFilters.value });
const categories = computed(() => { const source = report.value?.paths || []; return appliedFilters.value.project ? source.filter((item) => item.label === appliedFilters.value.project) : source; });
const days = computed(() => (report.value?.days || []).map((day) => ({ ...day, paths: categories.value.filter((category) => day.paths.some((item) => item.id === category.id || item.label === category.label)) })));
const filteredTotal = computed(() => days.value.reduce((sum, day) => sum + day.paths.reduce((dayTotal, item) => dayTotal + item.seconds, 0), 0));
const dateRangeLabel = computed(() => report.value ? `${format(parseISO(report.value.from), "MMM d")} – ${format(parseISO(report.value.to), "MMM d, yyyy")}` : "This week");
const projectOptions = computed(() => (report.value?.paths || []).map((item) => item.label));
const activeDays = computed(() => days.value.filter((day) => day.totalSeconds > 0).length);

function queryModel(): ReportQuery { return { startDate: report.value?.from || "", endDate: report.value?.to || "", teamIds: [], clientIds: [], projectIds: appliedFilters.value.project ? [appliedFilters.value.project] : [], taskIds: [], tagIds: [], description: appliedFilters.value.description }; }
async function load() { loading.value = true; error.value = ""; try { const query = queryModel(); const params = new URLSearchParams({ period: "WEEK", anchor: anchor.value }); if (query.description) params.set("description", query.description); if (query.projectIds.length) params.set("project", query.projectIds[0]); report.value = await api<Report>(`/reports?${params.toString()}`); } catch { error.value = "Unable to load the report. Please try again."; } finally { loading.value = false; } }
function shiftAnchor(amount: number) { const date = parseISO(anchor.value); date.setUTCDate(date.getUTCDate() + amount * 7); anchor.value = date.toISOString().slice(0, 10); void load(); }
function applyFilters() { appliedFilters.value = { ...draftFilters.value }; void load(); }
function exportReport() { const rows = [["Project", "Duration", "Seconds"], ...categories.value.map((item) => [item.label, formatDuration(item.seconds), String(item.seconds)])]; const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "know-report.csv"; link.click(); URL.revokeObjectURL(url); }
onMounted(load);
</script>

<template>
  <section class="reports-page">
    <div class="reports-header"><div><p class="eyebrow">TIME REPORT</p><h1>Reports</h1><p class="lede">Understand where your time goes, project by project.</p></div><div class="reports-actions"><ReportDateRange :label="dateRangeLabel" :anchor="anchor" @previous="shiftAnchor(-1)" @next="shiftAnchor(1)" @update:anchor="anchor = $event; load()" /><v-btn color="primary" variant="outlined" append-icon="mdi-chevron-down" @click="exportReport">Export</v-btn></div></div>
    <div class="reports-nav"><ReportTabs v-model="reportType" /><span class="report-type-note">{{ reportType }} report</span></div>
    <ReportFilters v-model="draftFilters" :project-options="projectOptions" @apply="applyFilters" />
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="loading" class="report-loading" role="status">Loading report…</div>
    <template v-else-if="report"><section class="report-card report-chart-card"><div class="report-card-heading"><div><span class="section-kicker">SUMMARY</span><h2>Tracked time</h2></div><strong class="total-display">{{ formatDuration(filteredTotal) }}</strong></div><SummaryBarChart :days="days" :categories="categories" /><div class="chart-day-totals"><span v-for="day in days" :key="day.date">{{ format(parseISO(day.date), "EEE, MMM d") }} <b>{{ formatDuration(day.totalSeconds) }}</b></span></div></section><section class="report-card breakdown-card"><div class="breakdown-toolbar"><span>Group by</span><v-select :items="['Project']" model-value="Project" density="compact" variant="outlined" hide-details /><span class="muted">{{ activeDays }} active days</span></div><div class="breakdown-grid"><div><ProjectDurationTable :categories="categories" :total-seconds="filteredTotal" /></div><div class="donut-panel"><ProjectDonutChart :categories="categories" :total-seconds="filteredTotal" /></div></div></section></template>
    <div v-else-if="!loading" class="empty report-card">No report data for this period.</div>
  </section>
</template>
