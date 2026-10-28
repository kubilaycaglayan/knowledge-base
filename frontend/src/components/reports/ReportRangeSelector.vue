<script setup lang="ts">
import { mdiArrowCollapseHorizontal, mdiArrowExpandHorizontal } from "@mdi/js";
import { computed, ref, watch } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTheme } from "../../lib/theme";

type RangeWindow = { start: number; end: number };
type ZoomMode = "available" | "full";

const props = withDefaults(
  defineProps<{
    values: number[];
    modelValue: RangeWindow;
    zoomMode: ZoomMode;
    dateRangeKey?: string;
  }>(),
  { dateRangeKey: "" },
);
const emit = defineEmits<{
  "update:modelValue": [window: RangeWindow];
  "update:zoomMode": [mode: ZoomMode];
}>();

use([LineChart, DataZoomComponent, GridComponent, SVGRenderer]);

const rangeWindow = ref({ ...props.modelValue });
let manualRangeWindow: RangeWindow | null = null;

const availableWindow = computed<RangeWindow>(() => {
  const nonzero = props.values
    .map((value, index) => (value > 0 ? index : -1))
    .filter((index) => index >= 0);
  if (props.values.length <= 1 || !nonzero.length)
    return { start: 0, end: 100 };
  const first = nonzero[0];
  const last = nonzero.at(-1)!;
  return {
    start: (first / props.values.length) * 100,
    end: ((last + 1) / props.values.length) * 100,
  };
});

function equalWindow(left: RangeWindow, right: RangeWindow): boolean {
  return Math.abs(left.start - right.start) < 0.01 && Math.abs(left.end - right.end) < 0.01;
}

function presetWindow(mode: ZoomMode): RangeWindow {
  return mode === "available"
    ? availableWindow.value
    : { start: 0, end: 100 };
}

watch(
  () => props.modelValue,
  (value) => {
    if (manualRangeWindow && equalWindow(value, manualRangeWindow)) return;
    manualRangeWindow = null;
    rangeWindow.value = { ...value };
  },
);

watch(
  [() => props.zoomMode, () => props.dateRangeKey],
  ([mode]) => {
    manualRangeWindow = null;
    rangeWindow.value = presetWindow(mode);
    emit("update:modelValue", rangeWindow.value);
  },
);

function handleDataZoom(event: unknown) {
  const candidate = Array.isArray(event) ? event[0] : event;
  const payload =
    candidate && typeof candidate === "object" && "batch" in candidate
      ? (candidate as { batch?: unknown[] }).batch?.[0]
      : candidate;
  if (!payload || typeof payload !== "object") return;
  const zoom = payload as { start?: number; end?: number };
  if (typeof zoom.start !== "number" || typeof zoom.end !== "number") return;
  manualRangeWindow = {
    start: Math.max(0, Math.min(100, zoom.start)),
    end: Math.max(0, Math.min(100, zoom.end)),
  };
  emit("update:modelValue", manualRangeWindow);
}

function toggleZoomMode() {
  const mode: ZoomMode = props.zoomMode === "full" ? "available" : "full";
  const nextWindow = presetWindow(mode);
  manualRangeWindow = null;
  rangeWindow.value = nextWindow;
  emit("update:zoomMode", mode);
  emit("update:modelValue", nextWindow);
}

const option = computed<EChartsOption>(() => ({
  animation: false,
  textStyle: { color: chartTheme.value.text },
  // A lightweight hidden-axis chart hosts ECharts' native slider for Sankey.
  grid: { left: 48, right: 150, top: 0, bottom: 48 },
  xAxis: {
    type: "category",
    data: props.values.map((_value, index) => String(index)),
    show: false,
    boundaryGap: true,
  },
  yAxis: { type: "value", show: false },
  series: [
    {
      type: "line",
      data: props.values,
      symbol: "none",
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      emphasis: { disabled: true },
      silent: true,
    },
  ],
  dataZoom:
    props.values.length > 2
      ? [
          {
            type: "slider",
            xAxisIndex: 0,
            start: manualRangeWindow?.start ?? rangeWindow.value.start,
            end: manualRangeWindow?.end ?? rangeWindow.value.end,
            left: 48,
            right: 150,
            height: 36,
            bottom: 12,
          },
        ]
      : [],
}));
</script>

<template>
  <div class="report-range-selector">
    <v-chart
      class="report-range-selector-chart"
      :option="option"
      :init-options="{ renderer: 'svg' }"
      autoresize
      @datazoom="handleDataZoom"
    />
    <button
      v-if="values.length > 2"
      class="chart-zoom-toggle"
      type="button"
      :aria-pressed="zoomMode === 'available'"
      :aria-label="`Chart range: ${zoomMode === 'available' ? 'available data' : 'full range'}. Activate to show ${zoomMode === 'available' ? 'full range' : 'available data'}.`"
      :title="zoomMode === 'available' ? 'Show full range' : 'Show available data'"
      @click="toggleZoomMode"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          :d="
            zoomMode === 'available'
              ? mdiArrowExpandHorizontal
              : mdiArrowCollapseHorizontal
          "
          fill="currentColor"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.report-range-selector {
  position: relative;
  width: 100%;
  height: 60px;
}

.report-range-selector-chart {
  width: 100%;
  height: 60px;
}

.chart-zoom-toggle {
  position: absolute;
  right: 18px;
  bottom: 2px;
  z-index: 2;
  display: inline-flex;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--workspace-control-border);
  border-radius: 6px;
  background: var(--workspace-surface);
  color: var(--workspace-text);
  font-size: 12px;
  cursor: pointer;
}

.chart-zoom-toggle:focus-visible {
  outline: 2px solid var(--workspace-accent);
  outline-offset: 2px;
}
</style>
