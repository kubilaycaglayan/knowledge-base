import { mount } from "@vue/test-utils";
import SummaryBarChart from "./SummaryBarChart.vue";

vi.mock("vue-echarts", () => ({ default: { name: "VChart", props: ["option"], template: "<div />" } }));

describe("SummaryBarChart", () => {
  const days = [{ date: "2026-09-05", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }], calendarNote: "Annual leave", calendarLabels: [{ id: "label-1", label: "Vacation", color: "#009688", portion: 1 }] }];
  const categories = [{ id: "path-1", label: "Wander", seconds: 3600 }];

  it("adds calendar inputs as label-colored shadow bars without changing time tracks", () => {
    const wrapper = mount(SummaryBarChart, { props: { days, categories, showCalendar: true } });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ name: string; type: string; yAxisIndex?: number; data?: Array<{ value: unknown[] }> }> }).series;
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ name: "Calendar input", type: "custom", yAxisIndex: 1, data: [{ value: [0, 0, 1, "#009688"] }] });
    expect(series[1]).toMatchObject({ name: "Wander" });
    expect((wrapper.getComponent({ name: "VChart" }).props("option") as { tooltip: { confine: boolean; extraCssText: string } }).tooltip).toMatchObject({ confine: true, extraCssText: expect.stringContaining("max-width: 320px") });
  });

  it("omits calendar inputs when disabled", () => {
    const wrapper = mount(SummaryBarChart, { props: { days, categories, showCalendar: false } });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ name: string }> }).series;
    expect(series).toEqual([expect.objectContaining({ name: "Wander" })]);
  });
});
