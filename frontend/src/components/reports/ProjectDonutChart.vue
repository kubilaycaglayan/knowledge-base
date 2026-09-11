<script setup lang="ts">
import { reportColors as colors } from "../../lib/chart-colors";
import { computed } from "vue";
import { chartTheme } from "../../lib/theme";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { formatDurationHoursMinutes } from "../../utils/duration";
const props = defineProps<{ categories: Array<{ id?: string; label: string; seconds: number; color?: string }>; totalSeconds: number }>();
use([PieChart, TooltipComponent, SVGRenderer]);
const option = computed<EChartsOption>(() => ({ animation: false, color: colors, tooltip: { backgroundColor: chartTheme.value.surface, borderColor: chartTheme.value.border, textStyle: { color: chartTheme.value.text }, trigger: "item", formatter: "{b}: {c} ({d}%)" }, series: [{ type: "pie", radius: ["54%", "78%"], center: ["50%", "50%"], avoidLabelOverlap: true, label: { show: false }, data: props.categories.map((item) => ({ name: item.label, value: item.seconds, itemStyle: item.color ? { color: item.color } : undefined })) }] }));
</script>
<template>
  <div class="donut-wrap" role="img" :aria-label="`Time by category: ${categories.map(item => `${item.label}: ${formatDurationHoursMinutes(item.seconds)}`).join('; ') || 'No tracked time'}`">
  <v-chart class="donut-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    <div class="donut-total"><strong>{{ formatDurationHoursMinutes(totalSeconds) }}</strong><span>Total</span></div>
  </div>
</template>
