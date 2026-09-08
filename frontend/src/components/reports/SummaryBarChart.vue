<script setup lang="ts">
import { reportColors as colors } from "../../lib/chart-colors";
import { computed } from "vue";
import { chartTheme } from "../../lib/theme";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { BarChart, CustomChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { format, parseISO } from "date-fns";
import { formatDuration, percentageOf } from "../../utils/duration";

type Category = { id?: string; label: string; seconds: number; color?: string };
type CalendarInput = { id: string; label: string; color?: string; portion?: number | null };
type Day = { date: string; totalSeconds: number; paths: Category[]; calendarNote?: string | null; calendarLabels?: CalendarInput[] };
const props = withDefaults(defineProps<{ days: Day[]; categories: Category[]; showCalendar?: boolean }>(), { showCalendar: false });
use([BarChart, CustomChart, DataZoomComponent, GridComponent, TooltipComponent, SVGRenderer]);
function colorFor(item: Category): string {
  if (item.color) return item.color;
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
  const inputs = day.calendarLabels?.length ? day.calendarLabels : day.calendarNote ? [{ id: `note-${day.date}`, label: "Calendar note", color: chartTheme.value.muted, portion: 0.18 }] : [];
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
type CalendarRenderApi = {
  value(index: number): number | string;
  coord(value: number[]): number[];
  size?(value: number[]): number | number[];
};
const option = computed<EChartsOption>(() => ({
  animation: false,
  textStyle: { color: chartTheme.value.text },
  color: colors,
  grid: { left: 48, right: 18, top: 30, bottom: props.days.length > 31 ? 74 : 44 },
  dataZoom: props.days.length > 31 ? [{ type: "inside", start: 0, end: Math.min(100, (31 / props.days.length) * 100) }, { type: "slider", start: 0, end: Math.min(100, (31 / props.days.length) * 100), height: 18, bottom: 12 }] : [],
  tooltip: {
    backgroundColor: chartTheme.value.surface, borderColor: chartTheme.value.border,
    textStyle: { color: chartTheme.value.text },
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
  xAxis: { type: "category", data: props.days.map((day) => format(parseISO(day.date), "EEE, MMM d")), axisTick: { show: false }, axisLabel: { color: chartTheme.value.muted, interval: 0, hideOverlap: true } },
  yAxis: [{ type: "value", name: "Hours", nameTextStyle: { color: chartTheme.value.muted }, axisLabel: { color: chartTheme.value.muted, formatter: (value: number) => `${(value / 3600).toFixed(0)}h` }, splitLine: { lineStyle: { color: chartTheme.value.border, type: "dashed" } } }, { type: "value", min: 0, max: calendarMaximum.value, show: false }],
  series: [
    ...(props.showCalendar && calendarBars.value.length ? [{ name: "Calendar input", type: "custom" as const, yAxisIndex: 1, silent: true, z: -1, data: calendarBars.value, renderItem: (_params: unknown, api: CalendarRenderApi) => {
      const x = api.coord([Number(api.value(0)), 0])[0];
      const start = api.coord([0, Number(api.value(1))])[1];
      const end = api.coord([0, Number(api.value(2))])[1];
      const categorySize = api.size?.([1, 0]);
      const categoryWidth = Array.isArray(categorySize) ? Number(categorySize[0]) : 74;
      const width = Math.min(74, Math.max(1, categoryWidth * 0.7));
      return calendarPattern(x - width / 2, end, width, start - end, String(api.value(3)));
    } }] : []),
    ...props.categories.map((category) => ({ name: category.label, type: "bar" as const, itemStyle: { color: colorFor(category) }, stack: "total", barMaxWidth: 74, data: props.days.map((day) => day.paths.find((item) => item.id === category.id || item.label === category.label)?.seconds || 0) })),
  ],
}));
</script>

<template>
  <div class="chart-frame" role="img" :aria-label="`${showCalendar ? 'Daily tracked time with calendar inputs' : 'Daily tracked time'}: ${days.map(day => `${day.date}: ${formatDuration(day.totalSeconds)}`).join('; ')}`">
    <v-chart class="report-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
  </div>
</template>
