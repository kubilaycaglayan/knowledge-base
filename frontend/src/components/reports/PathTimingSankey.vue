<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTheme } from "../../lib/theme";
import { formatDuration } from "../../utils/duration";

type SankeyNode = {
  id: string;
  label: string;
  color?: string | null;
  depth: number;
  value: number;
  pathLabel: string;
  bucketLabel: string;
};
type SankeyLink = {
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  value: number;
};
type Sankey = {
  granularity: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  nodes: SankeyNode[];
  links: SankeyLink[];
};

type RangeWindow = { start: number; end: number };
const props = withDefaults(
  defineProps<{
    sankey: Sankey;
    bucketCount?: number;
    rangeWindow?: RangeWindow;
  }>(),
  {
    bucketCount: 0,
    rangeWindow: () => ({ start: 0, end: 100 }),
  },
);
use([SankeyChart, TooltipComponent, SVGRenderer]);

const chartWidth = ref(1200);
function updateChartWidth() {
  chartWidth.value = Math.max(560, window.innerWidth);
}
onMounted(() => {
  updateChartWidth();
  window.addEventListener("resize", updateChartWidth);
});
onUnmounted(() => window.removeEventListener("resize", updateChartWidth));

const visibleSankey = computed<Sankey>(() => {
  const bucketCount = Math.max(
    props.bucketCount,
    ...props.sankey.nodes.map((node) => node.depth + 1),
  );
  if (!bucketCount) return props.sankey;
  const firstDepth = Math.min(
    bucketCount - 1,
    Math.floor((props.rangeWindow.start / 100) * bucketCount + 1e-9),
  );
  const lastDepth = Math.max(
    firstDepth,
    Math.min(
      bucketCount - 1,
      Math.ceil((props.rangeWindow.end / 100) * bucketCount - 1e-9) - 1,
    ),
  );
  const nodes = props.sankey.nodes
    .filter((node) => node.depth >= firstDepth && node.depth <= lastDepth)
    .map((node) => ({ ...node, depth: node.depth - firstDepth }));
  const visibleIds = new Set(nodes.map((node) => node.id));
  return {
    ...props.sankey,
    nodes,
    links: props.sankey.links.filter(
      (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
    ),
  };
});
const selectedBucketCount = computed(() => {
  const bucketCount = Math.max(
    props.bucketCount,
    ...props.sankey.nodes.map((node) => node.depth + 1),
  );
  if (!bucketCount) return 0;
  const firstDepth = Math.min(
    bucketCount - 1,
    Math.floor((props.rangeWindow.start / 100) * bucketCount + 1e-9),
  );
  const lastDepth = Math.max(
    firstDepth,
    Math.min(
      bucketCount - 1,
      Math.ceil((props.rangeWindow.end / 100) * bucketCount - 1e-9) - 1,
    ),
  );
  return lastDepth - firstDepth + 1;
});
const visibleNodeLabelIds = computed(() => {
  const depths = [...new Set(visibleSankey.value.nodes.map((node) => node.depth))].sort(
    (left, right) => left - right,
  );
  const plotWidth = Math.max(1, chartWidth.value - 150 - 150 - 14);
  const columnSpacing = plotWidth / Math.max(1, selectedBucketCount.value - 1);
  const labelInterval = Math.max(1, Math.ceil(110 / columnSpacing));
  let selectedDepths: Set<number>;
  if (depths.length <= 2) {
    selectedDepths = new Set(depths);
  } else {
    const firstDepth = depths[0];
    const lastDepth = depths.at(-1)!;
    const selected = [firstDepth];

    for (const depth of depths.slice(1, -1)) {
      if (
        depth - selected.at(-1)! >= labelInterval &&
        lastDepth - depth >= labelInterval
      ) {
        selected.push(depth);
      }
    }

    if (lastDepth - selected.at(-1)! < labelInterval && selected.length > 1) {
      selected.pop();
    }
    selected.push(lastDepth);
    selectedDepths = new Set(selected);
  }
  const labelsPerDepth = chartWidth.value < 700 ? 3 : 4;
  const visibleIds = new Set<string>();
  for (const depth of selectedDepths) {
    const nodes = visibleSankey.value.nodes.filter((node) => node.depth === depth);
    const candidates = nodes
      .filter((node) => nodes.length === 1 || node.pathLabel.length <= 28)
      .sort((left, right) => right.value - left.value)
      .slice(0, labelsPerDepth);
    for (const node of candidates) visibleIds.add(node.id);
  }
  return visibleIds;
});

const aggregateTotals = computed(() => {
  const totals = new Map<number, { bucketLabel: string; seconds: number }>();
  for (const node of visibleSankey.value.nodes) {
    const current = totals.get(node.depth);
    totals.set(node.depth, {
      bucketLabel: current?.bucketLabel || node.bucketLabel,
      seconds: (current?.seconds || 0) + node.value,
    });
  }
  const availableLabelWidth = Math.max(1, chartWidth.value - 150 - 150);
  const maximumVisibleLabels = Math.max(2, Math.floor(availableLabelWidth / 90));
  const labelInterval = Math.max(
    1,
    Math.ceil(selectedBucketCount.value / maximumVisibleLabels),
  );
  const populatedDepths = [...totals.entries()]
    .filter(([, total]) => total.seconds > 0)
    .map(([depth]) => depth);
  const firstPopulatedDepth = Math.min(...populatedDepths);
  const lastPopulatedDepth = Math.max(-1, ...populatedDepths);
  return Array.from({ length: selectedBucketCount.value }, (_, depth) => {
    const total = totals.get(depth);
    const seconds = total?.seconds || 0;
    return {
      depth,
      bucketLabel: total?.bucketLabel || "",
      seconds,
      showLabel:
        seconds > 0 &&
        (depth === firstPopulatedDepth ||
          depth === lastPopulatedDepth ||
          depth % labelInterval === 0),
    };
  });
});
const isolatedBuckets = computed(() => {
  const buckets = new Map<
    number,
    {
      depth: number;
      bucketLabel: string;
      seconds: number;
      paths: Array<{
        id: string;
        label: string;
        seconds: number;
        color?: string | null;
      }>;
    }
  >();
  for (const node of visibleSankey.value.nodes) {
    const bucket = buckets.get(node.depth) || {
      depth: node.depth,
      bucketLabel: node.bucketLabel,
      seconds: 0,
      paths: [],
    };
    bucket.seconds += node.value;
    bucket.paths.push({
      id: node.id,
      label: node.pathLabel,
      seconds: node.value,
      color: node.color,
    });
    buckets.set(node.depth, bucket);
  }
  return [...buckets.values()];
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

const ariaLabel = computed(() => {
  const flows = visibleSankey.value.links.map(
    (link) =>
      `${link.sourceLabel} to ${link.targetLabel}, ${formatDuration(link.value)}`,
  );
  const isolatedBuckets = visibleSankey.value.nodes.map(
    (node) =>
      `${node.bucketLabel}, ${node.pathLabel}, ${formatDuration(node.value)}`,
  );
  return `Time flow by ${visibleSankey.value.granularity.toLowerCase()}: ${flows.join("; ") || isolatedBuckets.join("; ") || "No tracked time"}`;
});
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
      const item = params as {
        dataType?: string;
        data?: SankeyLink & SankeyNode;
        name?: string;
      };
      if (item.dataType === "edge" && item.data) {
        return `<strong>${item.data.sourceLabel}</strong> → <strong>${item.data.targetLabel}</strong><br>${formatSankeyDuration(item.data.value)}`;
      }
      if (item.data?.pathLabel && item.data.bucketLabel) {
        return `<strong>${item.data.bucketLabel}</strong><br><strong>${item.data.pathLabel}</strong><br>${formatSankeyDuration(item.data.value)}`;
      }
      return item.name || "";
    },
  },
  series: [
    {
      type: "sankey",
      left: 150,
      right: 150,
      top: 18,
      bottom: 18,
      nodeWidth: 14,
      nodeGap: 12,
      nodeAlign: "left",
      draggable: false,
      labelLayout: { hideOverlap: true },
      emphasis: { focus: "adjacency" },
      lineStyle: { color: "gradient", opacity: 0.42, curveness: 0.48 },
      label: {
        color: chartTheme.value.text,
        overflow: "break",
        width: 110,
        lineHeight: 16,
        formatter: (params: unknown) => {
          const item = params as {
            data?: { pathLabel?: string };
            name?: string;
          };
          return item.data?.pathLabel || item.name || "";
        },
      },
      data: [
        ...visibleSankey.value.nodes.map((node) => {
          const firstDepth = Math.min(...visibleSankey.value.nodes.map((item) => item.depth));
          const position = node.depth === firstDepth ? "left" : "right";
          return {
            name: node.id,
            value: node.value,
            depth: node.depth,
            pathLabel: node.pathLabel,
            bucketLabel: node.bucketLabel,
            label: {
              show: visibleNodeLabelIds.value.has(node.id),
              position,
              align: position === "left" ? "right" : "left",
            },
            itemStyle: node.color ? { color: node.color } : undefined,
          };
        }),
        ...Array.from({ length: selectedBucketCount.value }, (_, depth) => depth)
          .filter((depth) => !visibleSankey.value.nodes.some((node) => node.depth === depth))
          .map((depth) => ({
            name: `empty-bucket:${depth}`,
            // ECharts disables vertical relaxation if any node has zero value.
            // Keep empty buckets invisible while allowing populated nodes to center.
            value: Number.EPSILON,
            depth,
            pathLabel: "",
            bucketLabel: "",
            label: { show: false },
            itemStyle: { color: "transparent", opacity: 0 },
            emphasis: { disabled: true },
          })),
      ],
      links: visibleSankey.value.links,
    },
  ],
}));
</script>

<template>
  <div class="sankey-frame" role="img" :aria-label="ariaLabel">
    <v-chart
      v-if="visibleSankey.nodes.length && visibleSankey.links.length"
      class="report-echart sankey-echart"
      :option="option"
      :init-options="{ renderer: 'svg' }"
      autoresize
    />
    <div v-else-if="visibleSankey.nodes.length" class="sankey-isolated-buckets">
      <article
        v-for="bucket in isolatedBuckets"
        :key="bucket.depth"
        class="sankey-isolated-bucket"
      >
        <header class="sankey-isolated-heading">
          <span class="sankey-isolated-date">{{ bucket.bucketLabel }}</span>
          <strong class="sankey-isolated-duration">{{
            formatSankeyDuration(bucket.seconds)
          }}</strong>
        </header>
        <ul class="sankey-isolated-paths">
          <li
            v-for="path in bucket.paths"
            :key="path.id"
            class="sankey-isolated-node"
            :style="{ '--sankey-node-color': path.color || 'var(--workspace-border)' }"
          >
            <span class="sankey-isolated-node-mark" aria-hidden="true" />
            <span class="sankey-isolated-path">{{ path.label }}</span>
            <span class="sankey-isolated-duration">{{
              formatSankeyDuration(path.seconds)
            }}</span>
          </li>
        </ul>
      </article>
    </div>
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
        :aria-label="
          total.seconds > 0
            ? `${total.bucketLabel}: ${formatSankeyDuration(total.seconds)}`
            : undefined
        "
        :class="{ 'has-total': total.seconds > 0 }"
      >
        <b v-if="total.showLabel">{{
          formatSankeyDuration(total.seconds)
        }}</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.sankey-isolated-buckets {
  display: flex;
  min-height: 360px;
  align-content: flex-start;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 12px;
}

.sankey-isolated-bucket {
  display: grid;
  width: min(720px, 100%);
  max-height: 420px;
  align-content: start;
  gap: 8px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--workspace-border);
  border-radius: 8px;
  background: var(--workspace-surface);
}

.sankey-isolated-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.sankey-isolated-date,
.sankey-isolated-duration {
  color: var(--workspace-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sankey-isolated-paths {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sankey-isolated-paths li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  align-items: start;
  column-gap: 10px;
  row-gap: 3px;
  min-height: 42px;
  padding: 6px 9px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--workspace-surface) 72%, transparent);
}

.sankey-isolated-node-mark {
  grid-row: span 2;
  height: 8px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--sankey-node-color);
}

.sankey-isolated-path {
  grid-column: 2;
  min-width: 0;
  overflow-wrap: anywhere;
}

.sankey-isolated-paths .sankey-isolated-duration {
  grid-column: 2;
  justify-self: start;
}

.sankey-aggregate-totals {
  position: relative;
  min-width: 416px;
  height: 30px;
  margin: -8px 150px 0 150px;
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

.sankey-aggregate-total:first-child {
  transform: none;
  text-align: left;
}

.sankey-aggregate-total:last-child {
  transform: translateX(-100%);
  text-align: right;
}

.sankey-aggregate-total b {
  font-weight: 700;
}

@media (max-width: 700px) {
  .sankey-aggregate-totals {
    margin-left: 150px;
    margin-right: 150px;
  }

  .sankey-isolated-bucket {
    max-height: none;
    overflow: visible;
  }
}
</style>
