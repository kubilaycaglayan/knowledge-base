<script setup lang="ts">
import { reportColors as colors } from "../../lib/chart-colors";
import { paletteColors } from "../../lib/color-palette";
import { computed } from "vue";
import { chartTheme } from "../../lib/theme";
import VChart from "vue-echarts";
import type { EChartsOption } from "echarts";
import { use } from "echarts/core";
import { BarChart, CustomChart, LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { format, parseISO } from "date-fns";
import { formatDuration, percentageOf } from "../../utils/duration";

type Category = { id?: string; label: string; seconds: number; color?: string };
type CalendarInput = {
  id: string;
  label: string;
  color?: string;
  portion?: number | null;
};
type Day = {
  date: string;
  totalSeconds: number;
  paths: Category[];
  calendarNote?: string | null;
  calendarLabels?: CalendarInput[];
};
const fallbackLabelColor = paletteColors[1];
type Aggregation = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export type TrendlineMode = "OFF" | "LINEAR" | "PARABOLIC";
const props = withDefaults(
  defineProps<{
    days: Day[];
    categories: Category[];
    showCalendar?: boolean;
    aggregation?: Aggregation;
    trendlineMode?: TrendlineMode;
  }>(),
  { showCalendar: false, aggregation: "DAY", trendlineMode: "OFF" },
);
use([
  BarChart,
  CustomChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  SVGRenderer,
]);
function colorFor(item: Category): string {
  if (item.color) return item.color;
  const index = props.categories.findIndex(
    (category) => category.id === item.id || category.label === item.label,
  );
  return colors[(index < 0 ? 0 : index) % colors.length];
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] || character,
  );
}
function bucketLabel(dateValue: string): string {
  const date = parseISO(dateValue);
  if (props.aggregation === "WEEK") return `Week of ${format(date, "MMM d")}`;
  if (props.aggregation === "MONTH") return format(date, "MMM yyyy");
  if (props.aggregation === "QUARTER")
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${format(date, "yyyy")}`;
  if (props.aggregation === "YEAR") return format(date, "yyyy");
  return format(date, "EEE, MMM d");
}
function aggregateDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
function calendarRows(day: Day): string {
  const note = day.calendarNote
    ? `<div>${escapeHtml(day.calendarNote)}</div>`
    : "";
  const labels = (day.calendarLabels || [])
    .map(
      (label) =>
        `<div class="tooltip-row"><span><i style="background:${label.color || fallbackLabelColor}"></i>${escapeHtml(label.label)}</span><b>${label.portion ? `${label.portion} day` : "Marked"}</b></div>`,
    )
    .join("");
  return note || labels ? `<hr><strong>Calendar</strong>${note}${labels}` : "";
}
const calendarMaximum = computed(() =>
  Math.max(
    1,
    ...props.days.map((day) =>
      (day.calendarLabels || []).reduce(
        (total, label) => total + (label.portion || 0.18),
        day.calendarNote && !day.calendarLabels?.length ? 0.18 : 0,
      ),
    ),
  ),
);
const calendarBars = computed(() =>
  props.days.flatMap((day, dayIndex) => {
    let end = calendarMaximum.value;
    const inputs = day.calendarLabels?.length
      ? day.calendarLabels
      : day.calendarNote
        ? [
            {
              id: `note-${day.date}`,
              label: "Calendar note",
              color: chartTheme.value.muted,
              portion: 0.18,
            },
          ]
        : [];
    return inputs.map((input) => {
      const portion = input.portion || 0.18;
      const start = Number((end - portion).toFixed(2));
      const bar = {
        value: [dayIndex, start, end, input.color || fallbackLabelColor],
      };
      end = start;
      return bar;
    });
  }),
);
type TrendPoint = { x: number; y: number };
function linearTrend(
  points: TrendPoint[],
  firstIndex: number,
  lastIndex: number,
): Array<number | null> {
  if (points.length < 2) return [];
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0,
  );
  if (!denominator) {
    return Array.from({ length: lastIndex + 1 }, (_value, index) =>
      index < firstIndex ? null : Math.round(meanY),
    );
  }
  const slope = points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  ) / denominator;
  const intercept = meanY - slope * meanX;
  return Array.from({ length: lastIndex + 1 }, (_value, index) =>
    index < firstIndex ? null : Math.max(0, Math.round(intercept + slope * index)),
  );
}
function parabolicTrend(
  points: TrendPoint[],
  firstIndex: number,
  lastIndex: number,
): Array<number | null> {
  if (points.length < 3) return [];
  const sumPowers = (power: number) =>
    points.reduce((sum, point) => sum + point.x ** power, 0);
  const weightedSum = (power: number) =>
    points.reduce((sum, point) => sum + point.y * point.x ** power, 0);
  const matrix = [
    [sumPowers(4), sumPowers(3), sumPowers(2)],
    [sumPowers(3), sumPowers(2), sumPowers(1)],
    [sumPowers(2), sumPowers(1), points.length],
  ];
  const rhs = [weightedSum(2), weightedSum(1), weightedSum(0)];
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < Number.EPSILON) {
      return linearTrend(points, firstIndex, lastIndex);
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [rhs[column], rhs[pivot]] = [rhs[pivot], rhs[column]];
    for (let row = column + 1; row < 3; row += 1) {
      const factor = matrix[row][column] / matrix[column][column];
      for (let item = column; item < 3; item += 1) matrix[row][item] -= factor * matrix[column][item];
      rhs[row] -= factor * rhs[column];
    }
  }
  const coefficients = [0, 0, 0];
  for (let row = 2; row >= 0; row -= 1) {
    const remainder = coefficients.slice(row + 1).reduce(
      (sum, coefficient, offset) => sum + coefficient * matrix[row][row + 1 + offset],
      0,
    );
    coefficients[row] = (rhs[row] - remainder) / matrix[row][row];
  }
  return Array.from({ length: lastIndex + 1 }, (_value, index) =>
    index < firstIndex
      ? null
      : Math.max(
          0,
          Math.round(coefficients[0] * index ** 2 + coefficients[1] * index + coefficients[2]),
        ),
  );
}
const trendlineValues = computed(() => {
  const points = props.days
    .map((day, index) => ({ x: index, y: day.totalSeconds }))
    .filter((point) => point.y > 0);
  const firstIndex = points[0]?.x;
  const lastIndex = points.at(-1)?.x;
  if (firstIndex === undefined || lastIndex === undefined) return [];
  return props.trendlineMode === "PARABOLIC"
    ? parabolicTrend(points, firstIndex, lastIndex)
    : props.trendlineMode === "LINEAR"
      ? linearTrend(points, firstIndex, lastIndex)
      : [];
});
function calendarPattern(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  const shape = { x, y, width, height };
  return {
    type: "group",
    clipPath: { type: "rect", shape },
    children: [
      { type: "rect", shape, style: { fill: color, opacity: 0.42 } },
      ...Array.from({ length: Math.ceil(height / 8) }, (_, index) => ({
        type: "rect",
        shape: { x, y: y + index * 8, width, height: 3 },
        style: { fill: "#ffffff", opacity: 0.38 },
      })),
    ],
  };
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
  grid: {
    left: 48,
    right: 18,
    top: 30,
    bottom: props.days.length > 31 ? 86 : 58,
  },
  dataZoom:
    props.days.length > 31
      ? [
          {
            type: "inside",
            start: 0,
            end: Math.min(100, (31 / props.days.length) * 100),
          },
          {
            type: "slider",
            start: 0,
            end: Math.min(100, (31 / props.days.length) * 100),
            height: 18,
            bottom: 12,
          },
        ]
      : [],
  tooltip: {
    backgroundColor: chartTheme.value.surface,
    borderColor: chartTheme.value.border,
    textStyle: { color: chartTheme.value.text },
    trigger: "axis",
    axisPointer: { type: "shadow" },
    confine: true,
    extraCssText:
      "max-width: 320px; white-space: normal; overflow-wrap: anywhere;",
    formatter: (params: unknown) => {
      const entries = Array.isArray(params)
        ? (params as Array<{
            axisValue: string;
            seriesName: string;
            value: number;
            color: string;
            dataIndex: number;
          }>)
        : [];
      const dayIndex = entries.length
        ? props.days.findIndex(
            (day) => bucketLabel(day.date) === entries[0].axisValue,
          )
        : 0;
      const day =
        props.days[dayIndex >= 0 ? dayIndex : entries[0]?.dataIndex || 0];
      if (!day) return "No tracked time";
      const rows = day.paths
        .map(
          (item) =>
            `<div class="tooltip-row"><span><i style="background:${colorFor(item)}"></i>${escapeHtml(item.label)}</span><b>${formatDuration(item.seconds)} <small>${percentageOf(item.seconds, day.totalSeconds).toFixed(2)}%</small></b></div>`,
        )
        .join("");
      const trend = trendlineValues.value[dayIndex >= 0 ? dayIndex : entries[0]?.dataIndex || 0];
      const trendRow = props.trendlineMode !== "OFF" && trend !== undefined
        ? `<div>${props.trendlineMode === "LINEAR" ? "Linear" : "Parabolic"} trend: ${formatDuration(Math.round(trend))}</div>`
        : "";
      return `<strong>${bucketLabel(day.date)}</strong><div>Total: ${formatDuration(day.totalSeconds)}</div>${trendRow}${rows}${props.showCalendar ? calendarRows(day) : ""}`;
    },
  },
  xAxis: {
    type: "category",
    data: props.days.map((day) => bucketLabel(day.date)),
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.value.muted,
      interval: 0,
      hideOverlap: true,
      formatter: (_value: string, index: number) => {
        const day = props.days[index];
        const label = `{bucket|${bucketLabel(day.date)}}`;
        return day.totalSeconds > 0
          ? `${label}\n{total|${aggregateDuration(day.totalSeconds)}}`
          : label;
      },
      rich: {
        bucket: {
          color: chartTheme.value.muted,
          fontSize: 11,
          lineHeight: 16,
        },
        total: {
          color: chartTheme.value.text,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 18,
        },
      },
    },
  },
  yAxis: [
    {
      type: "value",
      name: "Hours",
      nameTextStyle: { color: chartTheme.value.muted },
      axisLabel: {
        color: chartTheme.value.muted,
        formatter: (value: number) => `${(value / 3600).toFixed(0)}h`,
      },
      splitLine: {
        lineStyle: { color: chartTheme.value.border, type: "dashed" },
      },
    },
    { type: "value", min: 0, max: calendarMaximum.value, show: false },
  ],
  series: [
    ...(trendlineValues.value.length
      ? [{
          name: props.trendlineMode === "LINEAR" ? "Linear trend" : "Parabolic trend",
          type: "line" as const,
          data: trendlineValues.value,
          symbol: "none",
          lineStyle: { color: chartTheme.value.text, width: 2, type: "dashed" as const },
          z: 5,
        }]
      : []),
    ...(props.showCalendar && calendarBars.value.length
      ? [
          {
            name: "Calendar input",
            type: "custom" as const,
            yAxisIndex: 1,
            silent: true,
            z: 3,
            data: calendarBars.value,
            renderItem: (_params: unknown, api: CalendarRenderApi) => {
              const x = api.coord([Number(api.value(0)), 0])[0];
              const start = api.coord([0, Number(api.value(1))])[1];
              const end = api.coord([0, Number(api.value(2))])[1];
              const categorySize = api.size?.([1, 0]);
              const categoryWidth = Array.isArray(categorySize)
                ? Number(categorySize[0])
                : 74;
              const width = Math.min(74, Math.max(1, categoryWidth * 0.7));
              return calendarPattern(
                x - width / 2,
                end,
                width,
                start - end,
                String(api.value(3)),
              );
            },
          },
        ]
      : []),
    ...props.categories.map((category) => ({
      name: category.label,
      type: "bar" as const,
      itemStyle: { color: colorFor(category) },
      stack: "total",
      barMaxWidth: 74,
      data: props.days.map(
        (day) =>
          day.paths.find(
            (item) => item.id === category.id || item.label === category.label,
          )?.seconds || 0,
      ),
    })),
  ],
}));
</script>

<template>
  <div
    class="chart-frame"
    role="img"
    :aria-label="`${aggregation.toLowerCase()} tracked time${showCalendar ? ' with calendar inputs' : ''}${trendlineMode !== 'OFF' ? ` with ${trendlineMode.toLowerCase()} trendline` : ''}: ${days.filter((day) => day.totalSeconds > 0).map((day) => `${bucketLabel(day.date)}: ${aggregateDuration(day.totalSeconds)}`).join('; ') || 'No tracked time'}`"
  >
    <v-chart
      class="report-echart"
      :option="option"
      :init-options="{ renderer: 'svg' }"
      autoresize
    />
  </div>
</template>
