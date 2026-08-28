import { flushPromises, mount } from "@vue/test-utils";
import ReportsView from "./ReportsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ReportsView", () => {
  beforeEach(() => {
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
          items: [{ id: "item-1", label: "Walking", seconds: 1800 }],
        },
      ],
      paths: [{ id: "path-1", label: "Wander", seconds: 5400 }],
      items: [{ id: "item-1", label: "Walking", seconds: 5400 }],
    });
  });

  it("shows the daily timeline and path/resource categories", async () => {
    const wrapper = mount(ReportsView);
    await flushPromises();

    expect(wrapper.text()).toContain("Time, day by day");
    expect(wrapper.text()).toContain("Wander");
    expect(wrapper.text()).toContain("Walking");
    const dayLabel = "25/08/2026";
    expect(wrapper.text()).toContain(dayLabel);
    expect(wrapper.find(".report-svg").exists()).toBe(true);
    expect(wrapper.find(".report-svg rect").exists()).toBe(true);
    expect(
      wrapper.find(`[aria-label="${dayLabel}: 1h tracked"]`).exists(),
    ).toBe(true);
  });

  it.each(["month", "year"])("requests the selected %s view", async (label) => {
    const wrapper = mount(ReportsView);
    await flushPromises();
    await wrapper
      .findAll('button[aria-pressed="false"]')
      .find((button) => button.text() === label)!
      .trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      expect.stringContaining(`/reports?period=${label.toUpperCase()}`),
    );
  });
});
