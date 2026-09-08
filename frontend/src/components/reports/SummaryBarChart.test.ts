import { mount } from "@vue/test-utils";
import SummaryBarChart from "./SummaryBarChart.vue";

vi.mock("vue-echarts", () => ({ default: { name: "VChart", props: ["option"], template: "<div />" } }));

describe("SummaryBarChart", () => {
  const days = [{ date: "2026-08-31", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }] }, { date: "2026-09-04", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }], calendarNote: "Annual leave", calendarLabels: [{ id: "label-1", label: "Vacation", color: "#009688", portion: 1 }] }];
  const categories = [{ id: "path-1", label: "Wander", seconds: 3600 }];

  it("adds calendar inputs as label-colored shadow bars without changing time tracks", () => {
    const wrapper = mount(SummaryBarChart, { props: { days, categories, showCalendar: true } });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ name: string; type: string; yAxisIndex?: number; data?: Array<{ value: unknown[] }>; renderItem?: (params: unknown, api: { value(index: number): number | string; coord(value: number[]): number[]; size(value: number[]): number[] }) => { type: string; children: Array<{ shape: { x: number; width: number }; style: { fill: string } }> } }> }).series;
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ name: "Calendar input", type: "custom", yAxisIndex: 1, data: [{ value: [1, 0, 1, "#009688"] }] });
    expect(series[1]).toMatchObject({ name: "Wander" });
    expect((wrapper.getComponent({ name: "VChart" }).props("option") as { tooltip: { confine: boolean; extraCssText: string } }).tooltip).toMatchObject({ confine: true, extraCssText: expect.stringContaining("max-width: 320px") });
    const pattern = series[0].renderItem?.({}, { value: (index) => [0, 0, 1, "#009688"][index], coord: ([, value]) => [100, 200 - value * 100], size: () => [20, 0] });
    expect(pattern?.type).toBe("group");
    expect(pattern?.children[0].shape).toMatchObject({ x: 93, width: 14 });
    expect(pattern?.children[0]).toMatchObject({ style: { fill: "#009688" } });
    expect(pattern?.children.slice(1).some((child) => child.style.fill === "#ffffff")).toBe(true);
    const tooltip = (wrapper.getComponent({ name: "VChart" }).props("option") as { tooltip: { formatter(params: unknown): string } }).tooltip.formatter([{ axisValue: "Fri, Sep 4", dataIndex: 0 }]);
    expect(tooltip).toContain("Fri, Sep 4");
    expect(tooltip).toContain("Annual leave");
  });

  it("uses each path color for its bars and tooltip marker", () => {
    const wrapper = mount(SummaryBarChart, {
      props: {
        days: [{ date: "2026-09-04", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600, color: "#123456" }] }],
        categories: [{ id: "path-1", label: "Wander", seconds: 3600, color: "#123456" }],
      },
    });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      series: Array<{ itemStyle?: { color: string } }>;
      tooltip: { formatter(params: unknown): string };
    };

    expect(option.series[0].itemStyle).toEqual({ color: "#123456" });
    expect(option.tooltip.formatter([{ axisValue: "Fri, Sep 4", dataIndex: 0 }])).toContain('background:#123456');
  });

  it("omits calendar inputs when disabled", () => {
    const wrapper = mount(SummaryBarChart, { props: { days, categories, showCalendar: false } });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ name: string }> }).series;
    expect(series).toEqual([expect.objectContaining({ name: "Wander" })]);
  });

  it("escapes calendar tooltip content and enables zoom for long ranges", () => {
    const longDays = Array.from({ length: 40 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
      totalSeconds: 0,
      paths: [],
      calendarNote: index === 0 ? "<script>alert('&')</script>" : undefined,
    }));
    const wrapper = mount(SummaryBarChart, { props: { days: longDays, categories: [], showCalendar: true } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      dataZoom: unknown[];
      series: Array<{ data?: unknown[] }>;
      tooltip: { formatter(params: unknown): string };
    };

    expect(option.dataZoom).toHaveLength(2);
    expect(option.series[0].data).toEqual([{ value: [0, 0, 0.18, "#697781"] }]);
    const tooltip = option.tooltip.formatter([{ axisValue: "Sat, Aug 1", dataIndex: 0 }]);
    expect(tooltip).toContain("&lt;script&gt;alert(&#39;&amp;&#39;)&lt;/script&gt;");
    expect(tooltip).not.toContain("<script>");
  });

  it("returns a safe empty tooltip when no day matches", () => {
    const wrapper = mount(SummaryBarChart, { props: { days: [], categories: [], showCalendar: true } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as { tooltip: { formatter(params: unknown): string } };

    expect(option.tooltip.formatter([])).toBe("No tracked time");
  });

  it("renders marker-only and zero-portion calendar labels with safe fallback colors", () => {
    const wrapper = mount(SummaryBarChart, {
      props: {
        days: [
          {
            date: "2026-09-06",
            totalSeconds: 0,
            paths: [{ label: "Uncategorized", seconds: 0 }],
            calendarLabels: [
              { id: "marker", label: "Marker", portion: null },
              { id: "zero", label: "Zero", portion: 0 },
            ],
          },
        ],
        categories: [{ label: "Different category", seconds: 0 }],
        showCalendar: true,
      },
    });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      series: Array<{ data?: Array<{ value: unknown[] }> }>;
      tooltip: { formatter(params: unknown): string };
    };

    expect(option.series[0].data).toEqual([
      { value: [0, 0, 0.18, "#697781"] },
      { value: [0, 0.18, 0.36, "#697781"] },
    ]);
    const tooltip = option.tooltip.formatter([{ axisValue: "Sun, Sep 6", dataIndex: 0 }]);
    expect(tooltip).toContain("Marker");
    expect(tooltip).toContain("Marked");
    expect(tooltip).toContain("Zero");
    expect(tooltip).toContain("background:#697781");
  });

  it("falls back to the first day for malformed tooltip parameters", () => {
    const wrapper = mount(SummaryBarChart, { props: { days, categories } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      tooltip: { formatter(params: unknown): string };
    };

    expect(option.tooltip.formatter({})).toContain("Mon, Aug 31");
  });
});
