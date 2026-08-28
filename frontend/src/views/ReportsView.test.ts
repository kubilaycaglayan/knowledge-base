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
    expect(wrapper.text()).toContain("Summary");
    expect(wrapper.find(".report-echart").exists()).toBe(true);
    expect(wrapper.find(".donut-echart").exists()).toBe(true);
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("exposes the weekly date range and applies filters", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    expect(wrapper.text()).toContain("Aug 24 – Aug 30, 2026");
    expect(wrapper.text()).toContain("Apply filter");
    const apply = wrapper.findAll("button").find((button) => button.text().includes("Apply filter"));
    await apply?.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("/reports?period=WEEK"));
  });
});
