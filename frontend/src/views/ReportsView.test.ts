import { flushPromises, mount } from "@vue/test-utils";
import ReportsView from "./ReportsView.vue";
import { api } from "../lib/api";
import { endOfWeek, format, startOfWeek, subDays, subYears } from "date-fns";

vi.mock("vue-echarts", () => ({ default: { template: "<div />" } }));

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ReportsView", () => {
  const global = {
    stubs: {
      VBtn: { template: "<button><slot /></button>" },
      VTextField: { template: "<input />" },
      VSelect: { template: "<select><option>Project</option></select>" },
      VTable: { template: "<table><slot /></table>" },
      VChart: { template: "<div />" },
      ReportDateRange: {
        template:
          "<div><button class='test-range' @click=\"$emit('update:modelValue', { startDate: '2026-08-10', endDate: '2026-08-20' })\">Choose range</button><button aria-label='Previous date range' @click=\"$emit('previous')\">Previous</button><button aria-label='Next date range' @click=\"$emit('next')\">Next</button></div>",
      },
    },
  };
  beforeEach(() => {
    window.history.replaceState({}, "", "/reports");
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({
      period: "WEEK",
      from: "2026-08-24",
      to: "2026-08-30",
      totalSeconds: 5400,
      days: [
        {
          date: "2026-08-25",
          totalSeconds: 3600,
          paths: [{ id: "path-1", label: "Wander", seconds: 3600 }],
          sessionLabels: [],
          calendarNote: "Planning session",
          calendarLabels: [
            {
              id: "label-1",
              label: "Milestone",
              color: "#2878D5",
              portion: null,
            },
          ],
        },
      ],
      paths: [{ id: "path-1", label: "Wander", seconds: 5400 }],
      sessionLabels: [],
      calendarLabels: [],
      sankey: {
        granularity: "DAY",
        nodes: [
          {
            id: "bucket:2026-08-25:path:path-1",
            label: "Tue, Aug 25 · Wander",
            pathLabel: "Wander",
            bucketLabel: "Tue, Aug 25",
            color: "#123456",
            depth: 1,
            value: 3600,
          },
        ],
        links: [],
      },
    });
  });

  it("shows the report dashboard with project breakdown and charts", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    expect(wrapper.text()).toContain("Tracked time");
    expect(wrapper.text()).toContain("Wander");
    expect(wrapper.text()).toContain("Daily");
    expect(wrapper.text()).toContain("Weekly");
    expect(wrapper.text()).toContain("Monthly");
    expect(wrapper.text()).toContain("Quarterly");
    expect(wrapper.text()).toContain("Yearly");
    expect(
      wrapper.get('[data-report-tab="DAY"]').attributes("aria-selected"),
    ).toBe("true");
    const initialQuery = new URL(
      vi.mocked(api).mock.calls[0][0] as string,
      "https://knowledge-base.test",
    ).searchParams;
    expect(initialQuery.get("startDate")).toBe(
      format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    );
    expect(initialQuery.get("endDate")).toBe(
      format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    );
    expect(wrapper.text()).not.toContain("Shared");
    expect(wrapper.text()).not.toContain("Export");
    expect(wrapper.text()).not.toContain("Apply filter");
    expect(wrapper.text()).toContain("01:00:00");
    expect(wrapper.text()).toContain("Calendar log");
    expect(wrapper.text()).toContain("Planning session");
    expect(wrapper.text()).toContain("Milestone");
    expect(wrapper.text()).toContain("Hide calendar inputs");
    expect(wrapper.text()).toContain("Show Sankey");
    expect(wrapper.find(".chart-frame").exists()).toBe(true);
    expect(wrapper.find("#sankey-flow").exists()).toBe(false);
    expect(wrapper.find(".report-echart").exists()).toBe(true);
    expect(wrapper.find(".donut-echart").exists()).toBe(true);
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("keeps the selected aggregation when the date interval changes", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("aggregation=DAY"),
    );
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Monthly")!
      .trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("aggregation=MONTH"),
    );
    await wrapper.find(".test-range").trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe(
      "/reports?startDate=2026-08-10&endDate=2026-08-20&aggregation=MONTH",
    );
    expect(
      wrapper.get('[data-report-tab="MONTH"]').attributes("aria-selected"),
    ).toBe("true");
    await wrapper.get('[aria-label="Previous date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe(
      "/reports?startDate=2026-08-17&endDate=2026-08-23&aggregation=MONTH",
    );
  });

  it("selects rolling ranges suited to weekly, monthly, and quarterly aggregation", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    const expectedEnd = format(new Date(), "yyyy-MM-dd");

    for (const [label, aggregation, expectedStart] of [
      ["Weekly", "WEEK", format(subDays(new Date(), 29), "yyyy-MM-dd")],
      ["Monthly", "MONTH", format(subYears(new Date(), 1), "yyyy-MM-dd")],
      ["Quarterly", "QUARTER", format(subYears(new Date(), 2), "yyyy-MM-dd")],
    ] as const) {
      await wrapper
        .findAll("button")
        .find((button) => button.text() === label)!
        .trigger("click");
      await flushPromises();
      expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe(
        `/reports?startDate=${expectedStart}&endDate=${expectedEnd}&aggregation=${aggregation}`,
      );
    }
  });

  it("aggregates chart values at the selected semantic interval", async () => {
    vi.mocked(api).mockResolvedValue({
      period: "CUSTOM",
      from: "2026-01-01",
      to: "2026-06-30",
      totalSeconds: 10800,
      days: [
        {
          date: "2026-01-02",
          totalSeconds: 3600,
          paths: [{ id: "path-1", label: "Wander", seconds: 3600 }],
          sessionLabels: [],
        },
        {
          date: "2026-02-02",
          totalSeconds: 3600,
          paths: [{ id: "path-1", label: "Wander", seconds: 3600 }],
          sessionLabels: [],
        },
        {
          date: "2026-04-02",
          totalSeconds: 3600,
          paths: [{ id: "path-1", label: "Wander", seconds: 3600 }],
          sessionLabels: [],
        },
      ],
      paths: [{ id: "path-1", label: "Wander", seconds: 10800 }],
      sessionLabels: [],
      calendarLabels: [],
      sankey: { granularity: "QUARTER", nodes: [], links: [] },
    });
    const wrapper = mount(ReportsView, { global });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Quarterly")!
      .trigger("click");
    await flushPromises();

    expect(wrapper.get(".chart-frame").attributes("aria-label")).toContain(
      "quarter tracked time",
    );
    expect(wrapper.get(".chart-frame").attributes("aria-label")).toContain(
      "Q1 2026: 02:00:00",
    );
    expect(wrapper.get(".chart-frame").attributes("aria-label")).toContain(
      "Q2 2026: 01:00:00",
    );
  });

  it("toggles calendar inputs across the report", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper.get(".calendar-input-toggle").trigger("click");
    expect(wrapper.text()).toContain("Show calendar inputs");
    expect(wrapper.text()).not.toContain("Planning session");
  });

  it("shows the server-provided Sankey flow and stores the choice in the URL", async () => {
    window.history.replaceState({}, "", "/reports");
    const wrapper = mount(ReportsView, { global });
    await flushPromises();

    await wrapper.get(".sankey-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.get("#sankey-flow").text()).toContain("Path timing by day");
    expect(wrapper.find(".chart-frame").exists()).toBe(false);
    expect(wrapper.text()).toContain("0 tracked flows");
    expect(new URLSearchParams(window.location.search).get("sankey")).toBe("1");

    await wrapper.get(".sankey-toggle").trigger("click");
    expect(wrapper.find("#sankey-flow").exists()).toBe(false);
    expect(wrapper.find(".chart-frame").exists()).toBe(true);
  });

  it("shifts the selected interval in both directions without changing aggregation", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper.get('[aria-label="Previous date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("aggregation=DAY"),
    );
    await wrapper.get('[aria-label="Next date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("aggregation=DAY"),
    );
  });

  it("loads yearly aggregations and shifts the interval forward", async () => {
    const wrapper = mount(ReportsView, { global });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Yearly")!
      .trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("aggregation=YEAR"),
    );

    await wrapper.find(".test-range").trigger("click");
    await flushPromises();
    const before = vi.mocked(api).mock.calls.at(-1)?.[0];
    await wrapper.get('[aria-label="Next date range"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).not.toBe(before);
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe(
      "/reports?startDate=2026-08-31&endDate=2026-09-06&aggregation=YEAR",
    );
  });

  it("shows an error when the report request fails", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("network"));
    const wrapper = mount(ReportsView, { global });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Unable to load the report. Please try again.",
    );
    expect(wrapper.get('[role="alert"] button').text()).toBe("Try again");
  });

  it("shows loading feedback while a report request is pending", async () => {
    let resolveReport!: (value: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReport = resolve;
      }),
    );
    const wrapper = mount(ReportsView, { global });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="status"]').text()).toBe("Loading report…");

    resolveReport({
      period: "WEEK",
      from: "2026-08-24",
      to: "2026-08-30",
      totalSeconds: 0,
      days: [],
      paths: [],
      sessionLabels: [],
      calendarLabels: [],
    });
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("filters daily paths to the report categories and supports an empty report", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      period: "WEEK",
      from: "2026-08-24",
      to: "2026-08-30",
      totalSeconds: 3600,
      days: [
        {
          date: "2026-08-25",
          totalSeconds: 5400,
          paths: [
            { id: "path-1", label: "Wander", seconds: 3600 },
            { id: "other", label: "Other", seconds: 1800 },
          ],
        },
      ],
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
