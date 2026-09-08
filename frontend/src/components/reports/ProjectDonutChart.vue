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
import { formatDuration } from "../../utils/duration";
const props = defineProps<{ categories: Array<{ id?: string; label: string; seconds: number }>; totalSeconds: number }>();
use([PieChart, TooltipComponent, SVGRenderer]);
const option = computed<EChartsOption>(() => ({ animation: false, color: colors, tooltip: { backgroundColor: chartTheme.value.surface, borderColor: chartTheme.value.border, textStyle: { color: chartTheme.value.text }, trigger: "item", formatter: "{b}: {c} ({d}%)" }, series: [{ type: "pie", radius: ["54%", "78%"], center: ["50%", "50%"], avoidLabelOverlap: true, label: { show: false }, data: props.categories.map((item) => ({ name: item.label, value: item.seconds })) }] }));
</script>
<template>
  <div class="donut-wrap" role="img" :aria-label="`Time by project: ${categories.map(item => `${item.label}: ${formatDuration(item.seconds)}`).join('; ') || 'No tracked time'}`">
  <v-chart class="donut-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    <div class="donut-total"><strong>{{ formatDuration(totalSeconds) }}</strong><span>Total</span></div>
  </div>
</template>
