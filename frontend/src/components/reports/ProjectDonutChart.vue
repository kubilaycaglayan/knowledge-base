<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { formatDuration } from "../../utils/duration";
const props = defineProps<{ categories: Array<{ id?: string; label: string; seconds: number }>; totalSeconds: number }>();
use([PieChart, TooltipComponent, SVGRenderer]);
const colors = ["#f04438", "#2878d5", "#e91e63", "#4caf50", "#607d8b", "#ffbd19", "#8e5bd9"];
const option = computed<EChartsOption>(() => ({ color: colors, tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" }, series: [{ type: "pie", radius: ["54%", "78%"], center: ["50%", "50%"], avoidLabelOverlap: true, label: { show: false }, data: props.categories.map((item) => ({ name: item.label, value: item.seconds })) }] }));
</script>
<template>
  <div class="donut-wrap">
  <v-chart class="donut-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    <div class="donut-total"><strong>{{ formatDuration(totalSeconds) }}</strong><span>Total</span></div>
  </div>
</template>
