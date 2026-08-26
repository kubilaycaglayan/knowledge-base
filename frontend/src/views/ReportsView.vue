<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";

type Period = "WEEK" | "MONTH" | "YEAR";
type Category = { id?: string; label: string; seconds: number };
type Day = {
  date: string;
  totalSeconds: number;
  paths: Category[];
  items: Category[];
};
type Report = {
  period: Period;
  from: string;
  to: string;
  totalSeconds: number;
  days: Day[];
  paths: Category[];
  items: Category[];
};

const period = ref<Period>("WEEK");
const anchor = ref(new Date().toISOString().slice(0, 10));
const report = ref<Report | null>(null);
const error = ref("");
const loading = ref(false);
const format = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const maxDay = computed(() =>
  Math.max(1, ...(report.value?.days.map((day) => day.totalSeconds) || [1])),
);
const barWidth = (seconds: number) =>
  `${Math.max(0, Math.round((seconds / maxDay.value) * 100))}%`;
const chartDays = computed(() => report.value?.days || []);
const chartHeight = 180;
const chartWidth = 720;
const chartBarWidth = computed(() =>
  Math.max(6, Math.floor(chartWidth / Math.max(1, chartDays.value.length)) - 4),
);
const chartX = (index: number) =>
  Math.round(index * (chartWidth / Math.max(1, chartDays.value.length)) + 2);
const chartY = (seconds: number) =>
  Math.round(chartHeight - (seconds / maxDay.value) * (chartHeight - 20) - 10);
const chartBarHeight = (seconds: number) =>
  Math.max(2, chartHeight - chartY(seconds) - 10);
const rangeLabel = computed(() =>
  report.value
    ? `${dateLabel(report.value.from)} – ${dateLabel(report.value.to)}`
    : "",
);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    report.value = await api<Report>(
      `/reports?period=${period.value}&anchor=${anchor.value}`,
    );
  } catch {
    error.value = "Unable to load the report.";
  } finally {
    loading.value = false;
  }
}
function selectPeriod(value: Period) {
  period.value = value;
  void load();
}
function shiftAnchor(amount: number) {
  const date = new Date(`${anchor.value}T00:00:00Z`);
  if (period.value === "WEEK") date.setUTCDate(date.getUTCDate() + amount * 7);
  else if (period.value === "MONTH")
    date.setUTCMonth(date.getUTCMonth() + amount);
  else date.setUTCFullYear(date.getUTCFullYear() + amount);
  anchor.value = date.toISOString().slice(0, 10);
  void load();
}
function resetAnchor() {
  anchor.value = new Date().toISOString().slice(0, 10);
  void load();
}
onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow">MEASURE THE WORK</p>
    <h1>Reports</h1>
    <p class="lede">
      See where your time went, day by day, across paths and resources.
    </p>
    <div class="report-toolbar card">
      <div class="report-periods" role="group" aria-label="Report period">
        <button
          v-for="option in ['WEEK', 'MONTH', 'YEAR'] as Period[]"
          :key="option"
          class="text-button"
          :aria-pressed="period === option"
          @click="selectPeriod(option)"
        >
          {{ option.toLowerCase() }}
        </button>
      </div>
      <div class="report-navigation">
        <button
          class="text-button"
          aria-label="Previous report period"
          @click="shiftAnchor(-1)"
        >
          ← Previous
        </button>
        <button class="text-button" @click="resetAnchor">Current</button>
        <button
          class="text-button"
          aria-label="Next report period"
          @click="shiftAnchor(1)"
        >
          Next →
        </button>
        <input
          v-model="anchor"
          type="date"
          aria-label="Report anchor date"
          @change="load"
        />
      </div>
    </div>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div v-if="report && !loading" class="report-content">
      <section class="report-summary stats">
        <article class="card">
          <p class="eyebrow">PERIOD</p>
          <h2>{{ rangeLabel }}</h2>
        </article>
        <article class="card">
          <p class="eyebrow">TRACKED</p>
          <h2>{{ format(report.totalSeconds) }}</h2>
        </article>
        <article class="card">
          <p class="eyebrow">ACTIVE DAYS</p>
          <h2>
            {{ report.days.filter((day) => day.totalSeconds > 0).length }}
          </h2>
        </article>
      </section>
      <section class="card report-chart">
        <div class="report-heading">
          <div>
            <p class="eyebrow">DAILY TIMELINE</p>
            <h2>Time, day by day</h2>
          </div>
          <span class="muted">{{ report.period.toLowerCase() }} view</span>
        </div>
        <svg
          class="report-svg"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          role="img"
          :aria-label="`Tracked time chart for ${rangeLabel}`"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            :y1="chartHeight - 10"
            :x2="chartWidth"
            :y2="chartHeight - 10"
          />
          <rect
            v-for="(day, index) in chartDays"
            :key="day.date"
            :x="chartX(index)"
            :y="chartY(day.totalSeconds)"
            :width="chartBarWidth"
            :height="chartBarHeight(day.totalSeconds)"
            rx="3"
          >
            <title>
              {{ dateLabel(day.date) }}: {{ format(day.totalSeconds) }}
            </title>
          </rect>
        </svg>
        <div class="report-days">
          <article
            v-for="day in report.days"
            :key="day.date"
            class="report-day"
          >
            <div class="report-day-label">
              <strong>{{ dateLabel(day.date) }}</strong
              ><span class="muted">{{ format(day.totalSeconds) }}</span>
            </div>
            <div
              class="report-bar"
              role="img"
              :aria-label="`${dateLabel(day.date)}: ${format(day.totalSeconds)} tracked`"
            >
              <span :style="{ width: barWidth(day.totalSeconds) }"></span>
            </div>
            <div v-if="day.paths.length" class="report-day-categories">
              <span
                v-for="category in day.paths"
                :key="category.id || category.label"
                class="pill"
                >{{ category.label }} · {{ format(category.seconds) }}</span
              >
            </div>
            <p v-else class="muted report-empty-day">No tracked time</p>
          </article>
        </div>
      </section>
      <section class="report-columns">
        <article class="card">
          <p class="eyebrow">PATHS</p>
          <h2>Where time went</h2>
          <div
            v-for="category in report.paths"
            :key="category.id || category.label"
            class="report-category"
          >
            <span>{{ category.label }}</span
            ><strong>{{ format(category.seconds) }}</strong>
          </div>
          <p v-if="!report.paths.length" class="muted">
            No path activity in this period.
          </p>
        </article>
        <article class="card">
          <p class="eyebrow">RESOURCES</p>
          <h2>What you worked on</h2>
          <div
            v-for="category in report.items"
            :key="category.id || category.label"
            class="report-category"
          >
            <span>{{ category.label }}</span
            ><strong>{{ format(category.seconds) }}</strong>
          </div>
          <p v-if="!report.items.length" class="muted">
            No resource activity in this period.
          </p>
        </article>
      </section>
    </div>
    <p v-if="loading" class="empty" role="status">Loading report…</p>
  </section>
</template>
