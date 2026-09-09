import { flushPromises, mount } from "@vue/test-utils";
import CalendarView from "./CalendarView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=CALENDAR" && !options) return [{ id: "leave", name: "Sick leave", color: "#2878D5", scopes: ["CALENDAR"] }];
      if (path === "/labels/leave" && options?.method === "PUT") return { id: "leave", name: "Sick leave", color: "#E05D44", scopes: ["CALENDAR"] };
      if (path.startsWith("/calendar/days?")) return [];
      if (path === "/calendar/days/range" && options?.method === "PUT") return [{ date: "2026-09-01", note: null, labels: [{ labelId: "leave", name: "Sick leave", color: "#2878D5", portion: 1 }] }];
      if (path.startsWith("/calendar/days/") && options?.method === "PUT") return { date: path.split("/").at(-1), note: "Doctor visit", labels: [{ labelId: "leave", name: "Sick leave", color: "#2878D5", portion: 1 }] };
      if (path === "/labels" && options?.method === "POST") return { id: "vacation", name: "Vacation", color: null, scopes: ["CALENDAR"] };
      return undefined;
    });
  });

  it("loads labels and a month range, then saves a selected day with a full-day label", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels?scope=CALENDAR");
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
    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Vacation"') }));
    expect(wrapper.text()).toContain("Vacation");
  });

  it("creates a label from the keyboard Enter shortcut", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const input = wrapper.get('input[placeholder^="New label"]');
    await input.setValue("Keyboard label");
    await input.trigger("keyup", { key: "Enter" });
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Keyboard label"') }));
  });

  it("opens the ten-color palette and persists a selected label color", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    await wrapper.get('[aria-label="Change Sick leave color"]').trigger("click");
    expect(wrapper.findAll(".label-color-palette button")).toHaveLength(15);
    await wrapper.get('[aria-label="Set label color: Orange (#F97316)"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels/leave", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ name: "Sick leave", color: "#F97316", scopes: ["CALENDAR"] }),
    }));
  });

  it("drag-selects two calendar days and applies a label across the inclusive range", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("mouseenter");
    await days[10].trigger("mouseup", { button: 0 });
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("select").setValue("1");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/calendar/days/range", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"portion":1'),
    }));
  });

  it("supports month navigation and cancelling a range selection", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const initialDayRequest = vi.mocked(api).mock.calls.find(([path]) => typeof path === "string" && path.startsWith("/calendar/days?"))?.[0];
    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();
    const previousRequest = vi.mocked(api).mock.calls.filter(([path]) => typeof path === "string" && path.startsWith("/calendar/days?")).at(-1)?.[0];
    expect(previousRequest).not.toBe(initialDayRequest);
    await wrapper.get('[aria-label="Next month"]').trigger("click");
    await flushPromises();
    const requests = vi.mocked(api).mock.calls.filter(([path]) => typeof path === "string" && path.startsWith("/calendar/days?"));
    expect(requests.at(-1)?.[0]).toBe(initialDayRequest);
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("mouseenter");
    const cancel = wrapper.findAll("button.ghost").find((button) => button.text() === "Cancel range");
    expect(cancel).toBeDefined();
    await cancel!.trigger("click");
    expect(wrapper.findAll("button.ghost").some((button) => button.text() === "Cancel range")).toBe(false);
  });

  it("keeps a same-day pointer gesture as a single-day save", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const day = wrapper.findAll("button.calendar-day")[8];
    await day.trigger("mousedown", { button: 0 });
    await day.trigger("mouseup", { button: 0 });
    await wrapper.get("textarea").setValue("One day only");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.some(([path]) => path === "/calendar/days/range")).toBe(false);
    expect(vi.mocked(api).mock.calls.some(([path]) => typeof path === "string" && path.startsWith("/calendar/days/"))).toBe(true);
  });

  it("completes a range when the second day is clicked after range selection starts", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("click");
    expect(wrapper.text()).toContain("Apply to range");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.some(([path]) => path === "/calendar/days/range")).toBe(true);
  });

  it("shows an error when calendar records fail to load", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const wrapper = mount(CalendarView);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to load calendar records.");
  });

  it("shows actionable errors when calendar mutations fail", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=CALENDAR" && !options) return [{ id: "leave", name: "Sick leave", color: "#2878D5", scopes: ["CALENDAR"] }];
      if (path.startsWith("/calendar/days?")) return [];
      if (path === "/labels" && options?.method === "POST") throw new Error("duplicate");
      if (path === "/labels/leave" && options?.method === "PUT") throw new Error("color");
      if (path.startsWith("/calendar/days/") && options?.method === "PUT") throw new Error("save");
      return undefined;
    });
    const wrapper = mount(CalendarView);
    await flushPromises();

    await wrapper.get('input[placeholder^="New label"]').setValue("Vacation");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to add that label. Label names must be unique.");

    await wrapper.get('[aria-label="Change Sick leave color"]').trigger("click");
    await wrapper.get('[aria-label="Set label color: Orange (#F97316)"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to update that label color.");

    await wrapper.get("textarea").setValue("A note");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to save this day.");
  });

  it("selects the new-label color and ignores an empty label submission", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const colorButton = wrapper.get("#new-calendar-label-color");
    expect(wrapper.find("#new-calendar-label-palette").exists()).toBe(false);
    await colorButton.trigger("click");
    expect(colorButton.attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll("#new-calendar-label-palette button")).toHaveLength(15);
    await wrapper.get('[aria-label="Choose new label color: Orange (#F97316)"]').trigger("click");
    expect(wrapper.get("#new-calendar-label-color").attributes("aria-expanded")).toBe("false");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/labels" && options?.method === "POST")).toBe(false);
  });

  it("shows the empty-label guidance when no labels exist", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/labels?scope=CALENDAR") return [];
      if (path.startsWith("/calendar/days?")) return [];
      return undefined;
    });
    const wrapper = mount(CalendarView);
    await flushPromises();

    expect(wrapper.text()).toContain("Create a label below to begin.");
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("adds and removes a label selection before saving", async () => {
    const wrapper = mount(CalendarView);
    await flushPromises();
    const checkbox = wrapper.get('input[type="checkbox"]');
    await checkbox.setValue(true);
    expect(wrapper.get('select[aria-label="Sick leave day portion"]')).toBeTruthy();
    await checkbox.setValue(false);
    expect(wrapper.find('select[aria-label="Sick leave day portion"]').exists()).toBe(false);
  });

  it("renders saved notes and only the first two labels with an overflow count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/labels?scope=CALENDAR") return [
        { id: "one", name: "One", color: "#2878D5", scopes: ["CALENDAR"] },
        { id: "two", name: "Two", color: "#E05D44", scopes: ["CALENDAR"] },
        { id: "three", name: "Three", color: "#D69E2E", scopes: ["CALENDAR"] },
      ];
      if (path.startsWith("/calendar/days?")) return [{ date: today, note: "Important day", labels: [
        { labelId: "one", name: "One", color: "#E05D44", portion: null },
        { labelId: "two", name: "Two", color: "#E05D44", portion: null },
        { labelId: "three", name: "Three", color: "#D69E2E", portion: null },
      ] }];
      return undefined;
    });
    const wrapper = mount(CalendarView);
    await flushPromises();

    expect(wrapper.findAll(".calendar-label")).toHaveLength(2);
    expect(wrapper.find(".calendar-label").attributes("style")).toContain("#2878D5");
    expect(wrapper.text()).toContain("+1");
    expect(wrapper.text()).toContain("Note");
  });
});
