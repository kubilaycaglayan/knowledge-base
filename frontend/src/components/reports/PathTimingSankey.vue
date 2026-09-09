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

type SankeyNode = { id: string; label: string; color?: string | null };
type SankeyLink = { source: string; target: string; sourceLabel: string; targetLabel: string; value: number };
type Sankey = { granularity: "DAY" | "WEEK" | "MONTH"; nodes: SankeyNode[]; links: SankeyLink[] };

const props = defineProps<{ sankey: Sankey }>();
use([SankeyChart, TooltipComponent, SVGRenderer]);

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
      const item = params as { dataType?: string; data?: SankeyLink; name?: string };
      if (item.dataType !== "edge" || !item.data) return item.name || "";
      return `<strong>${item.data.sourceLabel}</strong> → <strong>${item.data.targetLabel}</strong><br>${formatDuration(item.data.value)}`;
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
    label: { color: chartTheme.value.text, overflow: "truncate", width: 116 },
    data: props.sankey.nodes.map((node) => ({ id: node.id, name: node.label, itemStyle: node.color ? { color: node.color } : undefined })),
    links: props.sankey.links,
  }],
}));
</script>

<template>
  <div class="sankey-frame" role="img" :aria-label="ariaLabel">
    <v-chart v-if="sankey.links.length" class="report-echart sankey-echart" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    <p v-else class="sankey-empty">No tracked time to show in this flow.</p>
  </div>
</template>
