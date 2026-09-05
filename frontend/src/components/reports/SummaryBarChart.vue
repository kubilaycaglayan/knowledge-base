<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { BarChart, CustomChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { format, parseISO } from "date-fns";
import { formatDuration, percentageOf } from "../../utils/duration";

type Category = { id?: string; label: string; seconds: number };
type CalendarInput = { id: string; label: string; color?: string; portion?: number | null };
type Day = { date: string; totalSeconds: number; paths: Category[]; calendarNote?: string | null; calendarLabels?: CalendarInput[] };
const props = withDefaults(defineProps<{ days: Day[]; categories: Category[]; showCalendar?: boolean }>(), { showCalendar: false });
use([BarChart, CustomChart, DataZoomComponent, GridComponent, TooltipComponent, SVGRenderer]);
const colors = ["#f04438", "#2878d5", "#e91e63", "#4caf50", "#607d8b", "#ffbd19", "#8e5bd9"];
function colorFor(item: Category): string {
  const index = props.categories.findIndex((category) => category.id === item.id || category.label === item.label);
  return colors[(index < 0 ? 0 : index) % colors.length];
}
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
function calendarRows(day: Day): string {
  const note = day.calendarNote ? `<div>${escapeHtml(day.calendarNote)}</div>` : "";
  const labels = (day.calendarLabels || []).map((label) => `<div class="tooltip-row"><span><i style="background:${label.color || "#697781"}"></i>${escapeHtml(label.label)}</span><b>${label.portion ? `${label.portion} day` : "Marked"}</b></div>`).join("");
  return note || labels ? `<hr><strong>Calendar</strong>${note}${labels}` : "";
}
const calendarBars = computed(() => props.days.flatMap((day, dayIndex) => {
  let start = 0;
  const inputs = day.calendarLabels?.length ? day.calendarLabels : day.calendarNote ? [{ id: `note-${day.date}`, label: "Calendar note", color: "#697781", portion: 0.18 }] : [];
  return inputs.map((input) => {
    const end = start + (input.portion || 0.18);
    const bar = { value: [dayIndex, start, end, input.color || "#697781"] };
    start = end;
    return bar;
  });
}));
const calendarMaximum = computed(() => Math.max(1, ...props.days.map((day) => (day.calendarLabels || []).reduce((total, label) => total + (label.portion || 0.18), day.calendarNote && !day.calendarLabels?.length ? 0.18 : 0))));
function calendarPattern(x: number, y: number, width: number, height: number, color: string) {
  const shape = { x, y, width, height };
  return { type: "group", clipPath: { type: "rect", shape }, children: [{ type: "rect", shape, style: { fill: color, opacity: 0.42 } }, ...Array.from({ length: Math.ceil(height / 8) }, (_, index) => ({ type: "rect", shape: { x, y: y + index * 8, width, height: 3 }, style: { fill: "#ffffff", opacity: 0.38 } }))] };
}
const option = computed<EChartsOption>(() => ({
  color: colors,
  grid: { left: 48, right: 18, top: 30, bottom: props.days.length > 31 ? 74 : 44 },
  dataZoom: props.days.length > 31 ? [{ type: "inside", start: 0, end: Math.min(100, (31 / props.days.length) * 100) }, { type: "slider", start: 0, end: Math.min(100, (31 / props.days.length) * 100), height: 18, bottom: 12 }] : [],
  tooltip: {
    trigger: "axis", axisPointer: { type: "shadow" }, confine: true, extraCssText: "max-width: 320px; white-space: normal; overflow-wrap: anywhere;",
    formatter: (params: unknown) => {
    const entries = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number; color: string; dataIndex: number }> : [];
      const dayIndex = entries.length ? props.days.findIndex((day) => format(parseISO(day.date), "EEE, MMM d") === entries[0].axisValue) : 0;
      const day = props.days[dayIndex >= 0 ? dayIndex : entries[0]?.dataIndex || 0];
      if (!day) return "No tracked time";
      const rows = day.paths.map((item) => `<div class="tooltip-row"><span><i style="background:${colorFor(item)}"></i>${escapeHtml(item.label)}</span><b>${formatDuration(item.seconds)} <small>${percentageOf(item.seconds, day.totalSeconds).toFixed(2)}%</small></b></div>`).join("");
      return `<strong>${format(parseISO(day.date), "EEE, MMM d")}</strong><div>Total: ${formatDuration(day.totalSeconds)}</div>${rows}${props.showCalendar ? calendarRows(day) : ""}`;
    },
  },
  xAxis: { type: "category", data: props.days.map((day) => format(parseISO(day.date), "EEE, MMM d")), axisTick: { show: false }, axisLabel: { color: "#697781", interval: 0, hideOverlap: true } },
  yAxis: [{ type: "value", name: "Hours", nameTextStyle: { color: "#697781" }, axisLabel: { color: "#697781", formatter: (value: number) => `${(value / 3600).toFixed(0)}h` }, splitLine: { lineStyle: { color: "#d9e0e5", type: "dashed" } } }, { type: "value", min: 0, max: calendarMaximum.value, show: false }],
  series: [
    ...(props.showCalendar && calendarBars.value.length ? [{ name: "Calendar input", type: "custom" as const, yAxisIndex: 1, silent: true, z: -1, data: calendarBars.value, renderItem: (_params: unknown, api: { value(index: number): number | string; coord(value: number[]): number[] }) => {
      const x = api.coord([Number(api.value(0)), 0])[0];
      const start = api.coord([0, Number(api.value(1))])[1];
      const end = api.coord([0, Number(api.value(2))])[1];
      return calendarPattern(x - 29, end, 74, start - end, String(api.value(3)));
    } }] : []),
    ...props.categories.map((category) => ({ name: category.label, type: "bar" as const, stack: "total", barMaxWidth: 74, data: props.days.map((day) => day.paths.find((item) => item.id === category.id || item.label === category.label)?.seconds || 0) })),
  ],
}));
</script>

<template>
  <div class="chart-frame" :aria-label="showCalendar ? 'Stacked daily tracked time chart with calendar inputs' : 'Stacked daily tracked time chart'">
    <v-chart class="report-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
  </div>
</template>
