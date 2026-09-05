import { flushPromises, mount } from "@vue/test-utils";
import CalendarView from "./CalendarView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/calendar/labels" && !options) return [{ id: "leave", name: "Sick leave", color: "#2878D5" }];
      if (path === "/calendar/labels/leave" && options?.method === "PUT") return { id: "leave", name: "Sick leave", color: "#E05D44" };
      if (path.startsWith("/calendar/days?")) return [];
      if (path === "/calendar/days/range" && options?.method === "PUT") return [{ date: "2026-09-01", note: null, labels: [{ labelId: "leave", name: "Sick leave", color: "#2878D5", portion: 1 }] }];
      if (path.startsWith("/calendar/days/") && options?.method === "PUT") return { date: path.split("/").at(-1), note: "Doctor visit", labels: [{ labelId: "leave", name: "Sick leave", color: "#2878D5", portion: 1 }] };
      if (path === "/calendar/labels" && options?.method === "POST") return { id: "vacation", name: "Vacation", color: null };
      return undefined;
    });
  });

  it("loads labels and a month range, then saves a selected day with a full-day label", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/calendar/labels");
    expect(vi.mocked(api)).toHaveBeenCalledWith(expect.stringMatching(/^\/calendar\/days\?startDate=.+&endDate=.+$/));

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("textarea").setValue("Doctor visit");
    await wrapper.get("select").setValue("1");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    const saveCall = vi.mocked(api).mock.calls.find(([path, options]) => path.startsWith("/calendar/days/") && options?.method === "PUT");
    expect(saveCall).toBeDefined();
    expect(saveCall![1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"portion":1') }));
    expect(saveCall![1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"note":"Doctor visit"') }));
  });

  it("creates a reusable label on demand", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    await wrapper.get('input[placeholder^="New label"]').setValue("Vacation");
    await wrapper.findAll("button").find(button => button.text() === "Add")!.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/calendar/labels", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Vacation"') }));
    expect(wrapper.text()).toContain("Vacation");
  });

  it("opens the ten-color palette and persists a selected label color", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    await wrapper.get('[aria-label="Change Sick leave color"]').trigger("click");
    expect(wrapper.findAll(".label-color-choice")).toHaveLength(10);
    await wrapper.get('[aria-label="#E05D44"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/calendar/labels/leave", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ name: "Sick leave", color: "#E05D44" }),
    }));
  });

  it("selects two calendar days and applies a label across the inclusive range", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    await wrapper.findAll("button").find(button => button.text() === "Select range")!.trigger("click");
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("click");
    await days[10].trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("select").setValue("1");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/calendar/days/range", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"portion":1'),
    }));
  });
});
