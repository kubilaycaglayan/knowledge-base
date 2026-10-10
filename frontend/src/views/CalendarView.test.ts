import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { format, parseISO } from "date-fns";
import CalendarView from "./CalendarView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import vuetify from "../plugins/vuetify";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const hiddenScopes = ["NOTE", "TIME_ENTRY", "LOG", "BOARD"];
const everyScope = ["NOTE", "CALENDAR", "TIME_ENTRY", "LOG", "BOARD"];
// The full catalog: one Calendar label and two labels hidden from Calendar.
const catalog = () => [
  { id: "focus", name: "Deep work", color: "#805AD5", scopes: hiddenScopes },
  { id: "gym", name: "Gym", color: null, scopes: ["NOTE"] },
  { id: "leave", name: "Sick leave", color: "#2878D5", scopes: ["CALENDAR"] },
];
const isCatalogRequest = (path: string, options?: RequestInit) =>
  (path === "/labels" || path === "/labels?scope=CALENDAR") &&
  (!options || !options.method || options.method === "GET");
const mounted: { unmount(): void }[] = [];
function mountView() {
  const wrapper = mount(CalendarView, {
    attachTo: document.body,
    global: { plugins: [vuetify] },
  });
  mounted.push(wrapper);
  return wrapper;
}
type View = ReturnType<typeof mountView>;
function pickerInput(wrapper: View) {
  const input = document.querySelector<HTMLInputElement>(
    '.label-picker-menu input[aria-label="Add or create calendar label"]',
  );
  if (input) return new DOMWrapper(input);
  return new DOMWrapper(document.querySelector<HTMLInputElement>(".label-picker-menu input")!);
}
async function openPicker(wrapper: View, search?: string) {
  if (!document.querySelector(".label-picker-menu"))
    await wrapper.get(".picker-chevron").trigger("click");
  await flushPromises();
  if (search !== undefined) {
    await pickerInput(wrapper).setValue(search);
    await flushPromises();
  }
  const menu = document.querySelector<HTMLElement>(
    ".label-picker-menu",
  );
  expect(menu).not.toBeNull();
  return menu!;
}
function menuItems(): DOMWrapper<HTMLElement>[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.label-picker-menu [role="option"]',
    ),
  ].map((element) => new DOMWrapper(element));
}
function menuItem(text: string) {
  if (text.startsWith("Create")) {
    const create = document.querySelector<HTMLElement>(
      '.label-picker-menu [role="option"][id$="option-create"]',
    );
    if (create) return new DOMWrapper(create);
  }
  const item = menuItems().find((element) => element.text().includes(text));
  expect(item, `menu item ${text}`).toBeDefined();
  return item!;
}
async function clickMenuItem(text: string) {
  await menuItem(text).trigger("click");
  await flushPromises();
}
function chipNames(wrapper: View) {
  return wrapper
    .findAll(".new-calendar-label .measure-row .chip-name")
    .map((chip) => chip.text());
}
function listedLabels(wrapper: View) {
  return wrapper.findAll(".day-label > label").map((label) => label.text());
}
function labelUpdates() {
  return vi
    .mocked(api)
    .mock.calls.filter(
      ([path, options]) =>
        typeof path === "string" &&
        path.startsWith("/labels/") &&
        options?.method === "PUT",
    );
}
function daySave() {
  const call = vi
    .mocked(api)
    .mock.calls.find(
      ([path, options]) =>
        typeof path === "string" &&
        path.startsWith("/calendar/days/") &&
        options?.method === "PUT",
    );
  expect(call).toBeDefined();
  return JSON.parse(String(call![1]!.body));
}

describe("CalendarView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no visualViewport, which Vuetify menus position against.
    vi.stubGlobal(
      "visualViewport",
      Object.assign(new EventTarget(), {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1,
      }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (isCatalogRequest(path, options)) return catalog();
        if (path === "/labels/leave" && options?.method === "PUT")
          return {
            id: "leave",
            name: "Sick leave",
            color: "#E05D44",
            scopes: ["CALENDAR"],
          };
        if (path.startsWith("/calendar/days?")) return [];
        if (path === "/calendar/days/range" && options?.method === "PUT")
          return [
            {
              date: "2026-09-01",
              note: null,
              labels: [
                {
                  labelId: "leave",
                  name: "Sick leave",
                  color: "#2878D5",
                  portion: 1,
                },
              ],
            },
          ];
        if (path.startsWith("/calendar/days/") && options?.method === "PUT")
          return {
            date: path.split("/").at(-1),
            note: "Doctor visit",
            labels: [
              {
                labelId: "leave",
                name: "Sick leave",
                color: "#2878D5",
                portion: 1,
              },
            ],
          };
        if (path === "/labels" && options?.method === "POST") {
          const body = JSON.parse(String(options.body));
          return { id: "created", ...body };
        }
        return undefined;
      },
    );
  });
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.unstubAllGlobals();
  });

  it("defaults to Marker and saves No marker with a zero portion", async () => {
    const today = new Date();
    const selectedDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    const select = wrapper.get('select[aria-label="Sick leave day portion"]');
    expect((select.element as HTMLSelectElement).value).toBe("");
    expect(select.get('option[value=""]').text()).toBe("Marker");
    await select.setValue("0");
    vi.mocked(api).mockResolvedValueOnce({
      date: selectedDate,
      note: null,
      labels: [
        {
          labelId: "leave",
          name: "Sick leave",
          color: "#2878D5",
          portion: 0,
        },
      ],
    });
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      expect.stringMatching(/^\/calendar\/days\//),
      expect.objectContaining({ body: expect.stringContaining('"portion":0') }),
    );
    expect(
      (wrapper.get('input[type="checkbox"]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect((select.element as HTMLSelectElement).value).toBe("0");
    wrapper.unmount();
  });

  it("loads labels and a month range, then saves a selected day with a full-day label", async () => {
    const today = new Date();
    const selectedDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    const wrapper = mountView();
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      expect.stringMatching(/^\/calendar\/days\?startDate=.+&endDate=.+$/),
    );

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("textarea").setValue("Doctor visit");
    await wrapper
      .get('select[aria-label="Sick leave day portion"]')
      .setValue("1");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    const saveCall = vi
      .mocked(api)
      .mock.calls.find(
        ([path, options]) =>
          path.startsWith("/calendar/days/") && options?.method === "PUT",
      );
    expect(saveCall).toBeDefined();
    expect(saveCall![0]).toBe(`/calendar/days/${selectedDate}`);
    expect(saveCall![1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining('"portion":1') }),
    );
    expect(saveCall![1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"note":"Doctor visit"'),
      }),
    );
  });

  it("opens the fifteen-color palette and persists a selected label color", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper
      .get('[aria-label="Change Sick leave color"]')
      .trigger("click");
    expect(wrapper.findAll(".label-color-palette button")).toHaveLength(15);
    await wrapper
      .get('[aria-label="Set label color: Orange (#F97316)"]')
      .trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/labels/leave",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Sick leave",
          color: "#F97316",
          scopes: ["CALENDAR"],
        }),
      }),
    );
  });

  it("drag-selects two calendar days and applies a label across the inclusive range", async () => {
    const wrapper = mountView();
    await flushPromises();
    const initialRequest = vi
      .mocked(api)
      .mock.calls.find(([path]) => String(path).startsWith("/calendar/days?"))?.[0];
    const gridStart = new URL(
      String(initialRequest),
      "https://knowledge-base.test",
    ).searchParams.get("startDate")!;
    const dateAt = (offset: number) => {
      const date = new Date(`${gridStart}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const expectedStart = dateAt(8);
    const expectedEnd = dateAt(10);
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("mouseenter");
    await days[10].trigger("mouseup", { button: 0 });
    expect(wrapper.get(".day-editor-heading h2").text()).toBe(
      `${format(parseISO(expectedStart), "MMM d")} – ${format(parseISO(expectedEnd), "MMM d, yyyy")}`,
    );
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper
      .get('select[aria-label="Sick leave day portion"]')
      .setValue("1");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    const rangeSave = vi.mocked(api).mock.calls.find(
      ([path, options]) => path === "/calendar/days/range" && options?.method === "PUT",
    );
    expect(rangeSave).toBeDefined();
    expect(JSON.parse(String(rangeSave![1]?.body))).toMatchObject({
      startDate: expectedStart,
      endDate: expectedEnd,
      labels: [{ labelId: "leave", portion: 1 }],
    });
  });

  it("supports month navigation and cancelling a range selection", async () => {
    const wrapper = mountView();
    await flushPromises();
    const monthSelect = wrapper.get(
      'select[aria-label="Calendar month"]',
    ).element as HTMLSelectElement;
    const yearSelect = wrapper.get(
      'select[aria-label="Calendar year"]',
    ).element as HTMLSelectElement;
    const initialMonth = Number(monthSelect.value);
    const initialYear = Number(yearSelect.value);
    const previousMonth = initialMonth === 0 ? 11 : initialMonth - 1;
    const previousYear = initialMonth === 0 ? initialYear - 1 : initialYear;
    const initialDayRequest = vi
      .mocked(api)
      .mock.calls.find(
        ([path]) =>
          typeof path === "string" && path.startsWith("/calendar/days?"),
      )?.[0];
    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();
    expect(Number(monthSelect.value)).toBe(previousMonth);
    expect(Number(yearSelect.value)).toBe(previousYear);
    const previousRequest = vi
      .mocked(api)
      .mock.calls.filter(
        ([path]) =>
          typeof path === "string" && path.startsWith("/calendar/days?"),
      )
      .at(-1)?.[0];
    expect(previousRequest).not.toBe(initialDayRequest);
    await wrapper.get('[aria-label="Next month"]').trigger("click");
    await flushPromises();
    expect(Number(monthSelect.value)).toBe(initialMonth);
    expect(Number(yearSelect.value)).toBe(initialYear);
    const requests = vi
      .mocked(api)
      .mock.calls.filter(
        ([path]) =>
          typeof path === "string" && path.startsWith("/calendar/days?"),
      );
    expect(requests).toHaveLength(2);
    expect(requests.at(-1)?.[0]).not.toBe(initialDayRequest);
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("mouseenter");
    const cancel = wrapper
      .findAll("button.ghost")
      .find((button) => button.text() === "Cancel range");
    expect(cancel).toBeDefined();
    await cancel!.trigger("click");
    expect(
      wrapper
        .findAll("button.ghost")
        .some((button) => button.text() === "Cancel range"),
    ).toBe(false);
    expect(
      vi.mocked(api).mock.calls.some(
        ([path, options]) =>
          path === "/calendar/days/range" && options?.method === "PUT",
      ),
    ).toBe(false);
    await days[9].trigger("mousedown", { button: 0 });
    await days[11].trigger("mouseenter");
    expect(
      vi.mocked(api).mock.calls.some(
        ([path, options]) =>
          path === "/calendar/days/range" && options?.method === "PUT",
      ),
    ).toBe(false);
  });

  it("returns to today and selects today's calendar date", async () => {
    const today = new Date();
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[aria-label="Previous month"]').trigger("click");
    await flushPromises();

    await wrapper.get('[aria-label="Today"]').trigger("click");
    await flushPromises();

    expect(
      (wrapper.get('select[aria-label="Calendar month"]').element as HTMLSelectElement)
        .value,
    ).toBe(String(today.getMonth()));
    expect(
      (wrapper.get('select[aria-label="Calendar year"]').element as HTMLSelectElement)
        .value,
    ).toBe(String(today.getFullYear()));
    expect(
      wrapper.get('button.calendar-day[aria-pressed="true"] time').text(),
    ).toBe(String(today.getDate()));

    await wrapper.get('[aria-label="Today"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.get('button.calendar-day[aria-pressed="true"] time').text(),
    ).toBe(String(today.getDate()));
  });

  it("changes the calendar month and year from their selectors", async () => {
    const wrapper = mountView();
    await flushPromises();
    const monthSelect = wrapper.get(
      'select[aria-label="Calendar month"]',
    );
    const yearSelect = wrapper.get('select[aria-label="Calendar year"]');
    const initialMonth = Number(
      (monthSelect.element as HTMLSelectElement).value,
    );
    const initialYear = Number((yearSelect.element as HTMLSelectElement).value);
    const requestedMonth = (initialMonth + 1) % 12;

    await monthSelect.setValue(String(requestedMonth));
    await flushPromises();
    expect((monthSelect.element as HTMLSelectElement).value).toBe(
      String(requestedMonth),
    );
    expect(wrapper.find("button.calendar-day.selected time").text()).toBe("1");

    await yearSelect.setValue(String(initialYear + 1));
    await flushPromises();
    expect((yearSelect.element as HTMLSelectElement).value).toBe(
      String(initialYear + 1),
    );
    expect((monthSelect.element as HTMLSelectElement).value).toBe(
      String(requestedMonth),
    );
    expect(wrapper.find("button.calendar-day.selected time").text()).toBe("1");
  });

  it("keeps a same-day pointer gesture as a single-day save", async () => {
    const wrapper = mountView();
    await flushPromises();
    const day = wrapper.findAll("button.calendar-day")[8];
    await day.trigger("mousedown", { button: 0 });
    await day.trigger("mouseup", { button: 0 });
    await wrapper.get("textarea").setValue("One day only");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => path === "/calendar/days/range"),
    ).toBe(false);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path]) =>
            typeof path === "string" && path.startsWith("/calendar/days/"),
        ),
    ).toBe(true);
  });

  it("completes a range when the second day is clicked after range selection starts", async () => {
    const wrapper = mountView();
    await flushPromises();
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("click");
    expect(wrapper.text()).toContain("Apply to range");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => path === "/calendar/days/range"),
    ).toBe(true);
  });

  it("selects and applies a date range through a keyboard-operable control", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[aria-label="Start date range selection"]').trigger("click");
    expect(wrapper.text()).toContain("Choose a start date, then choose an end date.");
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("click");
    expect(wrapper.text()).toContain("Choose an end date to complete the range.");
    await days[10].trigger("click");
    expect(wrapper.get(".day-editor-heading h2").text()).toContain("–");
    expect(wrapper.get("button.primary").text()).toContain("Apply to range");

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(
      vi.mocked(api).mock.calls.some(
        ([path, options]) =>
          path === "/calendar/days/range" && options?.method === "PUT",
      ),
    ).toBe(true);
  });

  it("keeps a failed range available for review and a successful retry", async () => {
    let rangeAttempts = 0;
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (isCatalogRequest(path, options)) return catalog();
        if (path.startsWith("/calendar/days?")) return [];
        if (path === "/calendar/days/range" && options?.method === "PUT") {
          rangeAttempts += 1;
          const body = JSON.parse(String(options.body));
          if (rangeAttempts === 1) throw new Error("network");
          return [body.startDate, body.endDate].map((date) => ({
            date,
            note: body.note,
            labels: body.labels,
          }));
        }
        return undefined;
      },
    );
    const wrapper = mountView();
    await flushPromises();
    const days = wrapper.findAll("button.calendar-day");
    await days[8].trigger("mousedown", { button: 0 });
    await days[10].trigger("mouseenter");
    await days[10].trigger("mouseup", { button: 0 });
    await wrapper.get("textarea").setValue("Range draft");

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Unable to save this day.",
    );
    expect(wrapper.get(".day-editor-heading h2").text()).toContain("–");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Range draft",
    );
    expect(wrapper.get("button.primary").text()).toContain("Apply to range");

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(rangeAttempts).toBe(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows an error when calendar records fail to load", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Unable to load calendar records.",
    );
  });

  it("shows actionable errors when calendar mutations fail", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (isCatalogRequest(path, options)) return catalog();
        if (path.startsWith("/calendar/days?")) return [];
        if (path === "/labels" && options?.method === "POST")
          throw new Error("duplicate");
        if (path === "/labels/leave" && options?.method === "PUT")
          throw new Error("color");
        if (path.startsWith("/calendar/days/") && options?.method === "PUT")
          throw new Error("save");
        return undefined;
      },
    );
    const wrapper = mountView();
    await flushPromises();

    await openPicker(wrapper, "Vacation");
    await clickMenuItem("Create “Vacation”");
    expect(document.querySelector(".picker-error")?.textContent).toBe(
      "Could not create that label. Names must be unique.",
    );

    await wrapper
      .get('[aria-label="Change Sick leave color"]')
      .trigger("click");
    await wrapper
      .get('[aria-label="Set label color: Orange (#F97316)"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Unable to update that label color.",
    );

    await wrapper.get("textarea").setValue("A note");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Unable to save this day.",
    );
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "A note",
    );
  });

  it("selects the new-label color and offers no create item for an empty search", async () => {
    const wrapper = mountView();
    await flushPromises();
    const colorButton = wrapper.get("#new-calendar-label-color");
    expect(wrapper.find("#new-calendar-label-palette").exists()).toBe(false);
    await colorButton.trigger("click");
    expect(colorButton.attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll("#new-calendar-label-palette button")).toHaveLength(
      15,
    );
    await wrapper
      .get('[aria-label="Choose new label color: Orange (#F97316)"]')
      .trigger("click");
    expect(
      wrapper.get("#new-calendar-label-color").attributes("aria-expanded"),
    ).toBe("false");
    await openPicker(wrapper, "  ");
    expect(
      menuItems().some((item) => item.text().includes("Create")),
    ).toBe(false);
  });

  it("shows the empty-label guidance when no labels exist", async () => {
    // CP-10
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (isCatalogRequest(path)) return [];
      if (path.startsWith("/calendar/days?")) return [];
      return undefined;
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Add or create a label below to begin.");
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("adds and removes a label selection before saving", async () => {
    const wrapper = mountView();
    await flushPromises();
    const checkbox = wrapper.get('input[type="checkbox"]');
    await checkbox.setValue(true);
    expect(
      wrapper.get('select[aria-label="Sick leave day portion"]'),
    ).toBeTruthy();
    await checkbox.setValue(false);
    expect(
      wrapper.get('select[aria-label="Sick leave day portion"]').classes(),
    ).toContain("day-portion--unset");
  });

  it("renders saved notes and only the first two labels with an overflow count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (isCatalogRequest(path))
        return [
          { id: "one", name: "One", color: "#2878D5", scopes: ["CALENDAR"] },
          { id: "two", name: "Two", color: "#E05D44", scopes: ["CALENDAR"] },
          {
            id: "three",
            name: "Three",
            color: "#D69E2E",
            scopes: ["CALENDAR"],
          },
        ];
      if (path.startsWith("/calendar/days?"))
        return [
          {
            date: today,
            note: "Important day",
            labels: [
              { labelId: "one", name: "One", color: "#E05D44", portion: null },
              { labelId: "two", name: "Two", color: "#E05D44", portion: null },
              {
                labelId: "three",
                name: "Three",
                color: "#D69E2E",
                portion: null,
              },
            ],
          },
        ];
      return undefined;
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll(".calendar-label")).toHaveLength(2);
    expect(wrapper.find(".calendar-label").attributes("style")).toContain(
      "#2878D5",
    );
    expect(wrapper.text()).toContain("+1");
    expect(wrapper.text()).toContain("Note");
    expect(wrapper.find(".calendar-day-details").exists()).toBe(true);
    expect(
      wrapper.find(".calendar-day-details .calendar-labels").exists(),
    ).toBe(true);
  });

  it("CP-03: lists only Calendar labels under the note", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(listedLabels(wrapper)).toEqual(["Sick leave"]);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1);
  });

  it("CP-04: searches every label in the add-or-create picker", async () => {
    const wrapper = mountView();
    await flushPromises();
    await openPicker(wrapper);
    expect(pickerInput(wrapper).attributes("placeholder")).toBe(
      "Search labels…",
    );
    expect(pickerInput(wrapper).attributes("aria-label")).toBe(
      "Add or create calendar label",
    );

    await openPicker(wrapper);
    expect(menuItems().map((item) => item.text().trim())).toEqual([
      "Deep work",
      "Gym",
      "Sick leave",
    ]);

    await pickerInput(wrapper).setValue("dee");
    await flushPromises();
    const titles = menuItems().map((item) => item.text().trim());
    expect(titles).toContain("Deep work");
    expect(titles).not.toContain("Gym");
  });

  it("CP-04: keeps the picker's prompt while no chips show", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find(".new-calendar-label .empty-picker").text()).toBe("Choose labels…");

    await openPicker(wrapper, "Deep");
    await clickMenuItem("Deep work");
    expect(chipNames(wrapper)).toEqual(["Deep work"]);
    expect(wrapper.find(".new-calendar-label .selected-chip").exists()).toBe(true);
  });

  it("CP-05: picks labels hidden from Calendar as chips without changing them", async () => {
    const wrapper = mountView();
    await flushPromises();

    await openPicker(wrapper, "Deep");
    await clickMenuItem("Deep work");
    await openPicker(wrapper, "Gym");
    await clickMenuItem("Gym");

    expect(chipNames(wrapper)).toEqual(["Deep work", "Gym"]);
    expect(listedLabels(wrapper)).toEqual(["Sick leave"]);
    await openPicker(wrapper, "");
    expect(menuItem("Deep work").attributes("aria-selected")).toBe("true");
    expect(menuItem("Gym").attributes("aria-selected")).toBe("true");
    expect(menuItem("Sick leave").attributes("aria-selected")).not.toBe(
      "true",
    );
    expect(labelUpdates()).toHaveLength(0);

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(daySave().labels).toEqual([
      { labelId: "focus", portion: null },
      { labelId: "gym", portion: null },
    ]);
    expect(labelUpdates()).toHaveLength(0);
  });

  it("CP-06: keeps Calendar labels in the list and the dropdown in sync", async () => {
    const wrapper = mountView();
    await flushPromises();

    await openPicker(wrapper, "Sick");
    await clickMenuItem("Sick leave");
    expect(
      (wrapper.get('input[type="checkbox"]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(chipNames(wrapper)).toEqual(["Sick leave"]);

    await wrapper.get('input[type="checkbox"]').setValue(false);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await openPicker(wrapper, "");
    expect(menuItem("Sick leave").attributes("aria-selected")).toBe("true");
  });

  it("CP-07: removes a picked label from its chip", async () => {
    const wrapper = mountView();
    await flushPromises();
    await openPicker(wrapper, "Deep");
    await clickMenuItem("Deep work");
    expect(chipNames(wrapper)).toEqual(["Deep work"]);

    await openPicker(wrapper);
    await clickMenuItem("Deep work");
    await flushPromises();
    expect(chipNames(wrapper)).toEqual([]);

    await openPicker(wrapper, "Gym");
    await clickMenuItem("Gym");
    await openPicker(wrapper, "");
    await clickMenuItem("Gym");
    expect(chipNames(wrapper)).toEqual([]);

    await wrapper.get("textarea").setValue("Rest day");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(daySave().labels).toEqual([]);
    expect(
      vi.mocked(api).mock.calls.some(
        ([, options]) => options?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("CP-08: creates a label visible everywhere from the picker", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get("#new-calendar-label-color").trigger("click");
    await wrapper
      .get('[aria-label="Choose new label color: Orange (#F97316)"]')
      .trigger("click");

    await openPicker(wrapper, "  Vacation  ");
    await clickMenuItem("Create “Vacation”");

    const create = vi
      .mocked(api)
      .mock.calls.find(
        ([path, options]) => path === "/labels" && options?.method === "POST",
      );
    expect(create).toBeDefined();
    expect(JSON.parse(String(create![1]!.body))).toEqual({
      name: "Vacation",
      color: "#F97316",
      scopes: everyScope,
    });
    expect(listedLabels(wrapper)).toEqual(["Sick leave", "Vacation"]);
    const created = wrapper
      .findAll(".day-label")
      .find((row) => row.text().includes("Vacation"))!;
    expect(
      (created.get('input[type="checkbox"]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(chipNames(wrapper)).toEqual(["Vacation"]);

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(daySave().labels).toEqual([{ labelId: "created", portion: null }]);
  });

  it("CP-08: creates a label from the keyboard Enter key", async () => {
    const wrapper = mountView();
    await flushPromises();
    await openPicker(wrapper, "Keyboard label");
    await pickerInput(wrapper).trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/labels",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"name":"Keyboard label"'),
      }),
    );
  });

  it("CP-08: offers the existing label instead of creating a duplicate", async () => {
    const wrapper = mountView();
    await flushPromises();
    await openPicker(wrapper, "deep WORK");

    expect(
      menuItems().some((item) => item.text().includes("Create")),
    ).toBe(false);
    await clickMenuItem("Deep work");
    expect(chipNames(wrapper)).toEqual(["Deep work"]);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path, options]) => path === "/labels" && options?.method === "POST",
        ),
    ).toBe(false);
  });

  it("CP-08: shows an error when creating a label fails", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (isCatalogRequest(path, options)) return catalog();
        if (path.startsWith("/calendar/days?")) return [];
        if (path === "/labels" && options?.method === "POST")
          throw new Error("duplicate");
        return undefined;
      },
    );
    const wrapper = mountView();
    await flushPromises();
    await openPicker(wrapper, "Vacation");
    await clickMenuItem("Create “Vacation”");

    expect(document.querySelector(".picker-error")?.textContent).toBe(
      "Could not create that label. Names must be unique.",
    );
    expect(chipNames(wrapper)).toEqual([]);
    expect(listedLabels(wrapper)).toEqual(["Sick leave"]);
  });

  it("CP-09: shows a saved day's hidden labels as chips", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (isCatalogRequest(path, options)) return catalog();
        if (path.startsWith("/calendar/days?"))
          return [
            {
              date: today,
              note: null,
              labels: [
                {
                  labelId: "focus",
                  name: "Deep work",
                  color: "#4A5568",
                  portion: 0.5,
                },
                {
                  labelId: "leave",
                  name: "Sick leave",
                  color: "#2878D5",
                  portion: null,
                },
              ],
            },
          ];
        if (path.startsWith("/calendar/days/") && options?.method === "PUT")
          return { date: today, note: null, labels: [] };
        return undefined;
      },
    );
    const wrapper = mountView();
    await flushPromises();

    expect(chipNames(wrapper)).toEqual(["Deep work", "Sick leave"]);
    expect(
      (wrapper.get('input[type="checkbox"]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    const gridLabel = wrapper
      .findAll(".calendar-label")
      .find((label) => label.text() === "Deep work")!;
    expect(gridLabel.attributes("style")).toContain("#805AD5");

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(daySave().labels).toEqual([
      { labelId: "focus", portion: 0.5 },
      { labelId: "leave", portion: null },
    ]);
  });

  it("keeps each label row's layout when a label is checked or unchecked", async () => {
    // Checking a label used to insert its day-portion select, growing the row
    // (and wrapping it onto a second line on phones). The select now stays in
    // the row, hidden and disabled while the label is unchecked.
    const wrapper = mountView();
    await flushPromises();
    const row = () => wrapper.get(".day-label");
    const portion = () =>
      row().get('select[aria-label="Sick leave day portion"]');
    const shape = () => row().element.children.length;
    const unchecked = shape();

    expect(portion().classes()).toContain("day-portion--unset");
    expect(portion().attributes("disabled")).toBeDefined();
    expect(portion().attributes("aria-hidden")).toBe("true");

    await row().get('input[type="checkbox"]').setValue(true);
    expect(shape()).toBe(unchecked);
    expect(portion().classes()).not.toContain("day-portion--unset");
    expect(portion().attributes("disabled")).toBeUndefined();
    expect(portion().attributes("aria-hidden")).toBeUndefined();

    await row().get('input[type="checkbox"]').setValue(false);
    expect(shape()).toBe(unchecked);
    expect(portion().classes()).toContain("day-portion--unset");
  });
});
