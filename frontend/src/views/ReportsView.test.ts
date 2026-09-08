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
    ReportDateRange: { template: "<div><button class='test-range' @click=\"$emit('update:modelValue', { startDate: '2026-08-10', endDate: '2026-08-20' })\">Choose range</button><button aria-label='Previous date range' @click=\"$emit('previous')\">Previous</button><button aria-label='Next date range' @click=\"$emit('next')\">Next</button></div>" },
  } };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({ period: "WEEK", from: "2026-08-24", to: "2026-08-30", totalSeconds: 5400, days: [{ date: "2026-08-25", totalSeconds: 3600, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }], sessionLabels: [], calendarNote: "Planning session", calendarLabels: [{ id: "label-1", label: "Milestone", color: "#2878D5", portion: null }] }], paths: [{ id: "path-1", label: "Wander", seconds: 5400 }], sessionLabels: [], calendarLabels: [] });
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
    expect(wrapper.text()).toContain("Calendar log");
    expect(wrapper.text()).toContain("Planning session");
    expect(wrapper.text()).toContain("Milestone");
    expect(wrapper.text()).toContain("Hide calendar inputs");
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
    await wrapper.get('[aria-label="Previous date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/reports?startDate=2026-08-17&endDate=2026-08-23");
  });

  it("toggles calendar inputs across the report", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper.get(".calendar-input-toggle").trigger("click");
    expect(wrapper.text()).toContain("Show calendar inputs");
    expect(wrapper.text()).not.toContain("Planning session");
  });

  it("shifts the selected weekly range in both directions", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper.get('[aria-label="Previous date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("period=WEEK"));
    await wrapper.get('[aria-label="Next date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("period=WEEK"));
  });

  it("loads yearly periods and shifts a custom range forward", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Yearly")!.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining("period=YEAR"));

    await wrapper.find(".test-range").trigger("click");
    await flushPromises();
    const before = vi.mocked(api).mock.calls.at(-1)?.[0];
    await wrapper.get('[aria-label="Next date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).not.toBe(before);
    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/reports?startDate=2026-08-31&endDate=2026-09-06");
  });

  it("shows an error when the report request fails", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("network"));
    const wrapper = mount(ReportsView, { global });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to load the report. Please try again.");
  });

  it("shows loading feedback while a report request is pending", async () => {
    let resolveReport!: (value: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(new Promise((resolve) => { resolveReport = resolve; }));
    const wrapper = mount(ReportsView, { global });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="status"]').text()).toBe("Loading report…");

    resolveReport({ period: "WEEK", from: "2026-08-24", to: "2026-08-30", totalSeconds: 0, days: [], paths: [], sessionLabels: [], calendarLabels: [] });
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("filters daily paths to the report categories and supports an empty report", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      period: "WEEK",
      from: "2026-08-24",
      to: "2026-08-30",
      totalSeconds: 3600,
      days: [{ date: "2026-08-25", totalSeconds: 5400, paths: [{ id: "path-1", label: "Wander", seconds: 3600 }, { id: "other", label: "Other", seconds: 1800 }] }],
      paths: [{ id: "path-1", label: "Wander", seconds: 3600 }],
      sessionLabels: [],
      calendarLabels: [],
    });
    const filtered = mount(ReportsView, { global });
    await flushPromises();
    expect(filtered.text()).toContain("01:00:00");
    expect(filtered.text()).not.toContain("Other");

    vi.mocked(api).mockResolvedValueOnce(null);
    const empty = mount(ReportsView, { global });
    await flushPromises();
    expect(empty.text()).toContain("No report data for this period.");
  });

  it("renders calendar label day and marker summaries", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      period: "WEEK",
      from: "2026-08-24",
      to: "2026-08-30",
      totalSeconds: 0,
      days: [],
      paths: [],
      sessionLabels: [],
      calendarLabels: [
        { id: "leave", label: "Leave", days: 2, markers: 0 },
        { id: "milestone", label: "Milestone", days: 0, markers: 1 },
      ],
    });
    const wrapper = mount(ReportsView, { global });
    await flushPromises();

    expect(wrapper.text()).toContain("Leave");
    expect(wrapper.text()).toContain("2 days");
    expect(wrapper.text()).toContain("Milestone");
    expect(wrapper.text()).toContain("1 marked day");
  });
});
