import { flushPromises, mount } from "@vue/test-utils";
import ReportsView from "./ReportsView.vue";
import { api } from "../lib/api";

vi.mock("vue-echarts", () => ({ default: { template: "<div />" } }));

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ReportsView", () => {
  const global = { stubs: {
    VBtn: { template: "<button><slot /></button>" },
    VTextField: { template: "<input />" },
    VSelect: { template: "<select><option>Project</option></select>" },
    VTable: { template: "<table><slot /></table>" },
    VChart: { template: "<div />" },
    ReportDateRange: { template: "<button class='test-range' @click=\"$emit('update:modelValue', { startDate: '2026-08-10', endDate: '2026-08-20' })\">Choose range</button>" },
  } };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({ period: "WEEK", from: "2026-08-24", to: "2026-08-30", totalSeconds: 5400, days: [{ date: "2026-08-25", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }], items: [] }], paths: [{ id: "path-1", label: "Wander", seconds: 5400 }], items: [] });
  });

  it("shows the report dashboard with project breakdown and charts", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    expect(wrapper.text()).toContain("Tracked time");
    expect(wrapper.text()).toContain("Wander");
    expect(wrapper.text()).toContain("Weekly");
    expect(wrapper.text()).toContain("Monthly");
    expect(wrapper.text()).toContain("Yearly");
    expect(wrapper.text()).not.toContain("Shared");
    expect(wrapper.text()).not.toContain("Export");
    expect(wrapper.text()).not.toContain("Apply filter");
    expect(wrapper.text()).toContain("01:00:00");
    expect(wrapper.find(".report-echart").exists()).toBe(true);
    expect(wrapper.find(".donut-echart").exists()).toBe(true);
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("loads quick periods and a custom date interval", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("/reports?period=WEEK"));
    await wrapper.findAll("button").find((button) => button.text() === "Monthly")!.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("period=MONTH"));
    await wrapper.find(".test-range").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/reports?startDate=2026-08-10&endDate=2026-08-20");
  });
});
