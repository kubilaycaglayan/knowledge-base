import { mount } from "@vue/test-utils";
import ProjectDonutChart from "./ProjectDonutChart.vue";

vi.mock("vue-echarts", () => ({
  default: { name: "VChart", props: ["option"], template: "<div class='chart' />" },
}));

describe("ProjectDonutChart", () => {
  it("renders the total and maps categories into pie-series data", () => {
    const wrapper = mount(ProjectDonutChart, {
      props: {
        categories: [
          { id: "one", label: "Learning", seconds: 3600 },
          { id: "two", label: "Planning", seconds: 1800 },
        ],
        totalSeconds: 5400,
      },
    });

    expect(wrapper.text()).toContain("01:30:00");
    expect(wrapper.text()).toContain("Total");
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ data: Array<{ name: string; value: number }> }> };
    expect(option.series[0].data).toEqual([
      { name: "Learning", value: 3600 },
      { name: "Planning", value: 1800 },
    ]);
  });

  it("renders a zero total without requiring categories", () => {
    const wrapper = mount(ProjectDonutChart, { props: { categories: [], totalSeconds: 0 } });

    expect(wrapper.text()).toContain("00:00:00");
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ data: unknown[] }> };
    expect(option.series[0].data).toEqual([]);
  });
});
