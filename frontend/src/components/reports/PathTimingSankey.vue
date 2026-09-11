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

const aggregateTotals = computed(() => {
  const totals = new Map<number, { bucketLabel: string; seconds: number }>();
  for (const node of props.sankey.nodes) {
    const current = totals.get(node.depth);
    totals.set(node.depth, {
      bucketLabel: current?.bucketLabel || node.bucketLabel,
      seconds: (current?.seconds || 0) + node.value,
    });
  }
  const lastDepth = Math.max(-1, ...props.sankey.nodes.map((node) => node.depth));
  return Array.from({ length: lastDepth + 1 }, (_, depth) => ({
    depth,
    bucketLabel: totals.get(depth)?.bucketLabel || "",
    seconds: totals.get(depth)?.seconds || 0,
  }));
});
function totalPosition(depth: number): string {
  const lastDepth = aggregateTotals.value.at(-1)?.depth || 0;
  return `${lastDepth ? (depth / lastDepth) * 100 : 50}%`;
}

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
    <div
      v-if="aggregateTotals.length"
      class="sankey-aggregate-totals"
      aria-label="Aggregated flow totals"
    >
      <span
        v-for="total in aggregateTotals"
        :key="total.depth"
        class="sankey-aggregate-total"
        :style="{ left: totalPosition(total.depth) }"
        :aria-label="total.seconds > 0 ? `${total.bucketLabel}: ${formatSankeyDuration(total.seconds)}` : undefined"
        :class="{ 'has-total': total.seconds > 0 }"
      >
        <b v-if="total.seconds > 0">{{ formatSankeyDuration(total.seconds) }}</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.sankey-aggregate-totals {
  position: relative;
  min-width: 416px;
  height: 30px;
  margin: -8px 132px 0 12px;
  color: var(--workspace-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.sankey-aggregate-total {
  position: absolute;
  top: 0;
  width: max-content;
  max-width: 88px;
  transform: translateX(-50%);
  overflow-wrap: anywhere;
  padding: 6px 4px 0;
  text-align: center;
}

.sankey-aggregate-total.has-total {
  border-top: 1px solid var(--workspace-border);
}

.sankey-aggregate-total b {
  font-weight: 700;
}

@media (max-width: 700px) {
  .sankey-aggregate-totals {
    margin-right: 132px;
  }
}
</style>
