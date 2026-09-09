<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTheme } from "../../lib/theme";
import { formatDuration } from "../../utils/duration";

type SankeyNode = { id: string; label: string; color?: string | null; depth: number; value: number; pathLabel: string; bucketLabel: string };
type SankeyLink = { source: string; target: string; sourceLabel: string; targetLabel: string; value: number };
type Sankey = { granularity: "DAY" | "WEEK" | "MONTH"; nodes: SankeyNode[]; links: SankeyLink[] };

const props = defineProps<{ sankey: Sankey }>();
use([SankeyChart, TooltipComponent, SVGRenderer]);

function formatSankeyDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

const ariaLabel = computed(() => `Time flow by ${props.sankey.granularity.toLowerCase()}: ${props.sankey.links.map((link) => `${link.sourceLabel} to ${link.targetLabel}, ${formatDuration(link.value)}`).join("; ") || "No tracked time"}`);
const option = computed<EChartsOption>(() => ({
  animation: false,
  textStyle: { color: chartTheme.value.text },
  tooltip: {
    trigger: "item",
    confine: true,
    backgroundColor: chartTheme.value.surface,
    borderColor: chartTheme.value.border,
    textStyle: { color: chartTheme.value.text },
    formatter: (params: unknown) => {
      const item = params as { dataType?: string; data?: SankeyLink & SankeyNode; name?: string };
      if (item.dataType === "edge" && item.data) {
        return `<strong>${item.data.sourceLabel}</strong> → <strong>${item.data.targetLabel}</strong><br>${formatSankeyDuration(item.data.value)}`;
      }
      if (item.data?.pathLabel && item.data.bucketLabel) {
        return `<strong>${item.data.bucketLabel}</strong><br><strong>${item.data.pathLabel}</strong><br>${formatSankeyDuration(item.data.value)}`;
      }
      return item.name || "";
    },
  },
  series: [{
    type: "sankey",
    left: 12,
    right: 132,
    top: 18,
    bottom: 18,
    nodeWidth: 14,
    nodeGap: 12,
    nodeAlign: "justify",
    draggable: false,
    emphasis: { focus: "adjacency" },
    lineStyle: { color: "gradient", opacity: 0.42, curveness: 0.48 },
    label: {
      color: chartTheme.value.text,
      overflow: "truncate",
      width: 116,
      formatter: (params: unknown) => {
        const item = params as { data?: { pathLabel?: string }; name?: string };
        return item.data?.pathLabel || item.name || "";
      },
    },
    data: props.sankey.nodes.map((node) => ({ name: node.id, value: node.value, depth: node.depth, pathLabel: node.pathLabel, bucketLabel: node.bucketLabel, itemStyle: node.color ? { color: node.color } : undefined })),
    links: props.sankey.links,
  }],
}));
</script>

<template>
  <div class="sankey-frame" role="img" :aria-label="ariaLabel">
    <v-chart v-if="sankey.nodes.length" class="report-echart sankey-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    <p v-else class="sankey-empty">No tracked time to show in this flow.</p>
  </div>
</template>
