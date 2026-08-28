<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { formatDuration, percentageOf } from "../../utils/duration";

type Category = { id?: string; label: string; seconds: number };
type Day = { date: string; totalSeconds: number; paths: Category[] };
const props = defineProps<{ days: Day[]; categories: Category[] }>();
use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);
const colors = ["#f04438", "#2878d5", "#e91e63", "#4caf50", "#607d8b", "#ffbd19", "#8e5bd9"];
const option = computed<EChartsOption>(() => ({
  color: colors,
  grid: { left: 48, right: 18, top: 30, bottom: 44 },
  tooltip: {
    trigger: "axis", axisPointer: { type: "shadow" },
    formatter: (params: unknown) => {
    const entries = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number; color: string; dataIndex: number }> : [];
      const day = props.days[entries.length ? entries[0].dataIndex : 0];
      if (!day) return "No tracked time";
      const rows = day.paths.map((item) => `<div class="tooltip-row"><span><i style="background:${colors[props.categories.findIndex((c) => c.id === item.id || c.label === item.label) % colors.length]}"></i>${item.label}</span><b>${formatDuration(item.seconds)} <small>${percentageOf(item.seconds, day.totalSeconds).toFixed(2)}%</small></b></div>`).join("");
      return `<strong>${day.date}</strong><div>Total: ${formatDuration(day.totalSeconds)}</div>${rows}`;
    },
  },
  xAxis: { type: "category", data: props.days.map((day) => day.date), axisTick: { show: false }, axisLabel: { color: "#697781" } },
  yAxis: { type: "value", name: "Hours", nameTextStyle: { color: "#697781" }, axisLabel: { color: "#697781", formatter: (value: number) => `${(value / 3600).toFixed(0)}h` }, splitLine: { lineStyle: { color: "#d9e0e5", type: "dashed" } } },
  series: props.categories.map((category) => ({ name: category.label, type: "bar", stack: "total", barMaxWidth: 74, data: props.days.map((day) => day.paths.find((item) => item.id === category.id || item.label === category.label)?.seconds || 0) })),
}));
</script>

<template>
  <div class="chart-frame" aria-label="Stacked daily tracked time chart">
    <v-chart class="report-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
  </div>
</template>
