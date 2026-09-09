import { flushPromises, mount } from "@vue/test-utils";
import DashboardView from "./DashboardView.vue";
import { api } from "../lib/api";
import vuetify from "../plugins/vuetify";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const mountDashboard = () =>
  mount(DashboardView, { global: { plugins: [vuetify] } });

describe("DashboardView timer flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths") return [];
        if (path === "/calendar/labels") return [];
        if (path === "/timers/current") return null;
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        if (path === "/timers" && options.method === "POST")
          return {
            id: "timer-1",
            startedAt: new Date().toISOString(),
            description: "Focus",
          };
        if (path === "/timers/cancel") return undefined;
        return undefined;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a server timer and can cancel the active session", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.text()).toContain("Start a session");
    await wrapper.find("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wrapper.text()).toContain("Stop session");
    await wrapper.get("button.danger").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wrapper.text()).toContain("Start a session");
  });

  it("sends the selected path and description when starting a timer", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths") return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [];
      if (path === "/timers" && options.method === "POST") return { id: "timer-1", startedAt: new Date().toISOString(), pathId: "path-a", description: "Read graphs", running: true };
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.get('select[aria-label="Timer path"]').setValue("path-a");
    await wrapper.get('textarea[aria-label="Timer description"]').setValue("Read graphs");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    const start = vi.mocked(api).mock.calls.find(([path, options]) => path === "/timers" && options?.method === "POST");
    expect(JSON.parse(start?.[1]?.body as string)).toMatchObject({ pathId: "path-a", labelIds: [], description: "Read graphs" });
  });

  it("keeps session start controls at the top of the dashboard", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.find("section").classes()).toContain("session-grid");
    expect(wrapper.find("section").text()).toContain("FOCUS TODAY");
  });

  it("preserves application-owned metadata when mounting and leaving the overview", async () => {
    document.title = "Knowledge Base";
    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = "#151a22";
    document.head.append(themeColor);
    const wrapper = mountDashboard();
    await flushPromises();

    expect(document.title).toBe("Knowledge Base");
    expect(themeColor.content).toBe("#151a22");
    expect(wrapper.get('[role="timer"]').attributes("aria-live")).toBe("off");
    wrapper.unmount();
    expect(document.title).toBe("Knowledge Base");
    expect(themeColor.content).toBe("#151a22");
    themeColor.remove();
  });

  it("offers every owned label for the selected timer path", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "path-a", name: "Algorithms", status: "ACTIVE" },
          { id: "path-b", name: "Writing", status: "ACTIVE" },
        ];
      if (path === "/calendar/labels")
        return [
          { id: "label-a", name: "Graphs", color: null },
          { id: "label-b", name: "Essays", color: null },
        ];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByLabel: {},
        };
      if (path === "/time-entries") return [];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('select[aria-label="Timer path"]').setValue("path-a");
    const timerLabelSelect = wrapper.findComponent({ name: "VSelect" });
    const selectLabels = timerLabelSelect.props("items") as { name: string }[];
    expect(selectLabels.map((label) => label.name)).toContain("Graphs");
    expect(selectLabels.map((label) => label.name)).toContain("Essays");
  });

  it("shows the five most recently used paths and selects one when clicked", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "path-a", name: "Algorithms", status: "ACTIVE" },
          { id: "path-b", name: "Writing", status: "ACTIVE" },
          { id: "path-c", name: "Reading", status: "ACTIVE" },
          { id: "path-d", name: "Music", status: "ACTIVE" },
          { id: "path-e", name: "Travel", status: "ACTIVE" },
          { id: "path-f", name: "Cooking", status: "ACTIVE" },
        ];
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByLabel: {},
        };
      if (path === "/time-entries")
        return [
          { id: "entry-1", pathId: "path-a", startedAt: "2026-08-25T10:00:00Z" },
          { id: "entry-2", pathId: "path-a", startedAt: "2026-08-24T10:00:00Z" },
          { id: "entry-3", pathId: "path-b", startedAt: "2026-08-23T10:00:00Z" },
          { id: "entry-4", pathId: "path-c", startedAt: "2026-08-22T10:00:00Z" },
          { id: "entry-5", pathId: "path-d", startedAt: "2026-08-21T10:00:00Z" },
          { id: "entry-6", pathId: "path-e", startedAt: "2026-08-20T10:00:00Z" },
          { id: "entry-7", pathId: "path-f", startedAt: "2026-08-19T10:00:00Z" },
        ];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();

    const recentPaths = wrapper.findAll(".recent-path");
    expect(recentPaths).toHaveLength(5);
    expect(recentPaths.map((button) => button.text())).toEqual([
      "Algorithms",
      "Writing",
      "Reading",
      "Music",
      "Travel",
    ]);

    await recentPaths[1].trigger("click");
    expect((wrapper.get('select[aria-label="Timer path"]').element as HTMLSelectElement).value).toBe("path-b");
    await wrapper.get('select[aria-label="Timer path"]').trigger("focus");
    await flushPromises();
    expect((wrapper.get('select[aria-label="Timer path"]').element as HTMLSelectElement).value).toBe("path-b");
  });

  it("creates a new label from the session flow and selects it", async () => {
    let created = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/calendar/labels" && options.method === "POST") {
          created = true;
          return {
            id: "label-new",
            name: "Dijkstra notes",
          };
        }
        if (path === "/calendar/labels")
          return created
            ? [{ id: "label-new", name: "Dijkstra notes", color: null }]
            : [];
        if (path === "/timers/current") return null;
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        return undefined;
      },
    );
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('select[aria-label="Timer path"]').setValue("path-a");
    await wrapper
      .get('input[aria-label="New session label name"]')
      .setValue("Dijkstra notes");
    await wrapper.get('input[aria-label="New session label name"]').trigger("keydown.enter");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/calendar/labels",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Dijkstra notes",
          color: null,
        }),
      }),
    );
    expect(
      (wrapper.findComponent({ name: "VSelect" }).props("modelValue") as string[]),
    ).toEqual(["label-new"]);
  });

  it("persists a newly created label on an already running timer", async () => {
    let created = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/calendar/labels" && options.method === "POST") {
          created = true;
          return { id: "label-new", name: "Dijkstra notes", color: null };
        }
        if (path === "/calendar/labels")
          return created
            ? [{ id: "label-new", name: "Dijkstra notes", color: null }]
            : [];
        if (path === "/timers/current")
          return {
            id: "timer-1",
            pathId: "path-a",
            startedAt: new Date().toISOString(),
            running: true,
          };
        if (path === "/timers/timer-1" && options.method === "PUT")
          return {
            id: "timer-1",
            pathId: "path-a",
            labelIds: ["label-new"],
            startedAt: new Date().toISOString(),
            running: true,
          };
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        return undefined;
      },
    );
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper
      .get('input[aria-label="New session label name"]')
      .setValue("Dijkstra notes");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Create label")!
      .trigger("click");
    await flushPromises();

    const update = vi
      .mocked(api)
      .mock.calls.find(([path, options]) => path === "/timers/timer-1" && options?.method === "PUT");
    expect(update).toBeDefined();
    expect(JSON.parse(update![1]?.body as string).labelIds).toEqual(["label-new"]);
  });

  it("creates and selects a path from the path dropdown", async () => {
    let created = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths" && options.method === "POST") {
          created = true;
          return { id: "path-new", name: "Research", status: "ACTIVE" };
        }
        if (path === "/paths") {
          return created
            ? [{ id: "path-new", name: "Research", status: "ACTIVE" }]
            : [];
        }
        if (path === "/calendar/labels") return [];
        if (path === "/timers/current") return null;
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        return undefined;
      },
    );
    const wrapper = mountDashboard();
    await flushPromises();

    const pathSelect = wrapper.get('select[aria-label="Timer path"]');
    expect(pathSelect.text()).toContain("＋ Add a new path…");
    await pathSelect.setValue("__add_new_path__");
    await flushPromises();

    const promptInput = wrapper.get('input[aria-label="New path name"]');
    await promptInput.setValue("Research");
    await wrapper
      .findAll(".prompt-dialog button")
      .find((button) => button.text() === "OK")!
      .trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Research",
          description: null,
          color: "#EF4444",
        }),
      }),
    );
    expect((pathSelect.element as HTMLSelectElement).value).toBe("path-new");
  });

  it("cancels adding a path without creating or configuring anything", async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const pathSelect = wrapper.get('select[aria-label="Timer path"]');
    await pathSelect.setValue("__add_new_path__");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");
    await flushPromises();

    expect((pathSelect.element as HTMLSelectElement).value).toBe("");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/paths" && options?.method === "POST")).toBe(false);
  });

  it("reports a failure when creating a path from the timer flow", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" && options.method === "POST") throw new Error("create path failed");
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.get('select[aria-label="Timer path"]').setValue("__add_new_path__");
    await wrapper.get('input[aria-label="New path name"]').setValue("Unavailable path");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create path.");
  });

  it("keeps active timer configuration controls visible and editable", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/calendar/labels")
          return [{ id: "label-a", name: "Graphs", color: null }];
        if (path === "/timers/current")
          return {
            id: "timer-a",
            pathId: "path-a",
            labelId: "label-a",
            startedAt: "2026-08-25T10:00:00Z",
            description: "Focus",
            running: true,
          };
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        if (path === "/timers/timer-a" && options.method === "PUT")
          return {
            id: "timer-a",
            pathId: "path-a",
            labelId: "label-a",
            startedAt: "2026-08-25T09:30:00Z",
            description: "Updated focus",
            running: true,
          };
        return undefined;
      },
    );
    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.find('input[aria-label="Timer start"]').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="Timer end"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Save timer settings");
    wrapper.findComponent({ name: "VSelect" }).vm.$emit("update:modelValue", ["label-a"]);
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers/timer-a", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"labelIds":["label-a"]'),
    }));
    await wrapper
      .find('input[aria-label="Timer start"]')
      .setValue("2026-08-25T09:30");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-a",
      expect.objectContaining({ method: "PUT" }),
    );
    await wrapper
      .find('textarea[aria-label="Timer description"]')
      .setValue("Updated description");
    await flushPromises();
    const updates = vi.mocked(api).mock.calls.filter(
      ([path, options]) =>
        path === "/timers/timer-a" && options?.method === "PUT",
    );
    expect(JSON.parse(updates[0]?.[1]?.body as string).endedAt).toBeUndefined();
    expect(
      updates.some(
        ([, options]) =>
          JSON.parse(options?.body as string).description ===
          "Updated description",
      ),
    ).toBe(true);
  });

  it("reports active-timer configuration failures", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths") return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return { id: "timer-a", pathId: "path-a", startedAt: "2026-08-25T10:00:00Z", running: true };
      if (path === "/time-entries") return [];
      if (path === "/timers/timer-a" && options.method === "PUT") throw new Error("configuration failed");
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.get('textarea[aria-label="Timer description"]').setValue("Updated description");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not save the active timer settings.");
  });

  it("updates the running clock when its start time is moved earlier", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-25T12:00:00Z") });
    let startedAt = "2026-08-25T11:00:00Z";
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths") return [];
        if (path === "/calendar/labels") return [];
        if (path === "/timers/current")
          return {
            id: "timer-a",
            startedAt,
            description: "Focus",
            running: true,
          };
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByLabel: {},
          };
        if (path === "/time-entries") return [];
        if (path === "/timers/timer-a" && options.method === "PUT") {
          startedAt = "2026-08-25T10:00:00Z";
          return { id: "timer-a", startedAt, description: "Focus", running: true };
        }
        return undefined;
      },
    );

    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.find(".focus strong").text()).toBe("01:00:00");

    await wrapper.find('input[aria-label="Timer start"]').setValue("2026-08-25T10:00");
    await flushPromises();

    expect(wrapper.find(".focus strong").text()).toBe("02:00:00");
    vi.useRealTimers();
  });

  it("syncs timer starts and stops made by another client", async () => {
    vi.useFakeTimers();
    let serverTimer: {
      id: string;
      startedAt: string;
      description: string;
      running: boolean;
    } | null = null;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/calendar/labels" || path === "/time-entries") return [];
      if (path === "/timers/current") return serverTimer;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByLabel: {},
        };
      return undefined;
    });

    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.text()).toContain("Start a session");

    serverTimer = {
      id: "extension-timer",
      startedAt: new Date().toISOString(),
      description: "From the extension",
      running: true,
    };
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(wrapper.text()).toContain("Stop session");
    expect(wrapper.text()).toContain("From the extension");

    serverTimer = null;
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(wrapper.text()).toContain("Start a session");
  });

  it("syncs metadata changes on the same running timer", async () => {
    vi.useFakeTimers();
    let serverTimer: Record<string, unknown> | null = {
      id: "timer-1",
      startedAt: "2026-08-25T11:00:00Z",
      pathId: "path-a",
      labelIds: ["label-a", "label-b"],
      description: "Original description",
      running: true,
    };
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "path-a", name: "Algorithms", status: "ACTIVE" },
          { id: "path-b", name: "Writing", status: "ACTIVE" },
        ];
      if (path === "/calendar/labels")
        return [
          { id: "label-a", name: "Graphs", color: null },
          { id: "label-b", name: "Essays", color: null },
        ];
      if (path === "/timers/current") return serverTimer;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByLabel: {},
        };
      if (path === "/time-entries") return [];
      return undefined;
    });

    const wrapper = mountDashboard();
    await flushPromises();
    expect(
      (wrapper.get('select[aria-label="Timer path"]').element as HTMLSelectElement).value,
    ).toBe("path-a");
    expect(
      (wrapper.get('textarea[aria-label="Timer description"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("Original description");

    serverTimer = {
      ...serverTimer,
      pathId: "path-b",
      labelIds: ["label-b", "label-a"],
      description: "Updated from another client",
    };
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(
      (wrapper.get('select[aria-label="Timer path"]').element as HTMLSelectElement).value,
    ).toBe("path-b");
    expect(
      (wrapper.get('textarea[aria-label="Timer description"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("Updated from another client");
    expect(wrapper.findComponent({ name: "VSelect" }).props("modelValue")).toEqual([
      "label-b",
      "label-a",
    ]);
  });

  it("shows the path and shortened description for recent sessions", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByLabel: {},
        };
      if (path === "/time-entries")
        return [
          {
            id: "entry-a",
            pathId: "path-a",
            startedAt: "2026-08-25T10:00:00Z",
            endedAt: "2026-08-25T10:30:00Z",
            durationSeconds: 1800,
            description:
              "A very long session description that should be shortened in the recent dashboard list because it contains lots of detail.",
          },
        ];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.text()).toContain("Algorithms");
    expect(wrapper.text()).toContain("A very long session description");
    expect(wrapper.text()).toContain("…");
  });

  it("edits a recent time entry after collecting new start and end times", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [{ id: "entry-a", startedAt: "2026-08-25T10:00:00Z", endedAt: "2026-08-25T10:30:00Z", durationSeconds: 1800, description: "Focus" }];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.find(".history-box button.text-button").trigger("click");
    await wrapper.get('input[aria-label="Start (ISO time)"]').setValue("2026-08-25T11:00:00Z");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await wrapper.get('input[aria-label="End (ISO time)"]').setValue("2026-08-25T11:45:00Z");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    const update = vi.mocked(api).mock.calls.find(([path, options]) => path === "/time-entries/entry-a" && options?.method === "PUT");
    expect(update).toBeDefined();
    expect(update?.[1]?.body).toContain('"startedAt":"2026-08-25T11:00:00.000Z"');
    expect(update?.[1]?.body).toContain('"endedAt":"2026-08-25T11:45:00.000Z"');
  });

  it("stops time-entry editing immediately when the start prompt is cancelled", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [{ id: "entry-a", startedAt: "2026-08-25T10:00:00Z", endedAt: "2026-08-25T10:30:00Z", description: "Focus" }];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.find(".history-box button.text-button").trigger("click");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".prompt-dialog").exists()).toBe(false);
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/time-entries/entry-a" && options?.method === "PUT")).toBe(false);
  });

  it("reports failures while editing a time entry or creating a session label", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths") return [];
      if (path === "/calendar/labels" && options.method === "POST") throw new Error("label failed");
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries" && !options.method) return [{ id: "entry-a", startedAt: "2026-08-25T10:00:00Z", endedAt: "2026-08-25T10:30:00Z", description: "Focus" }];
      if (path === "/time-entries/entry-a" && options.method === "PUT") throw new Error("entry failed");
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.find(".history-box button.text-button").trigger("click");
    await wrapper.get('input[aria-label="Start (ISO time)"]').setValue("2026-08-25T11:00:00Z");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await wrapper.get('input[aria-label="End (ISO time)"]').setValue("2026-08-25T11:30:00Z");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not edit time entry.");

    await wrapper.get('input[aria-label="New session label name"]').setValue("New label");
    await wrapper.findAll("button").find((button) => button.text() === "Create label")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create the session label.");
  });

  it("searches knowledge and renders returned results", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [];
      if (path === "/search?q=graph%20theory") return [{ id: "path-1", kind: "PATH", title: "Graph theory", detail: "Algorithms" }];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.get('input[aria-label="Search knowledge"]').setValue("graph theory");
    await wrapper.get(".search-box form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Graph theory");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/search?q=graph%20theory");
    await wrapper.get('input[aria-label="Search knowledge"]').setValue(" ");
    await wrapper.get(".search-box form").trigger("submit");
    expect(wrapper.text()).not.toContain("Graph theory");
  });

  it("shows actionable errors when starting a timer or searching fails", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/time-entries") return [];
      if (path === "/timers" && options.method === "POST") throw new Error("already running");
      if (path === "/search?q=missing") throw new Error("search failed");
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get("button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Only one timer can run at a time.");

    await wrapper.get('input[aria-label="Search knowledge"]').setValue("missing");
    await wrapper.get(".search-box form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Search failed.");
  });

  it("reports a cancellation failure without clearing the active timer", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths") return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/calendar/labels") return [];
      if (path === "/timers/current") return { id: "timer-a", pathId: "path-a", startedAt: "2026-08-25T10:00:00Z", running: true };
      if (path === "/time-entries") return [];
      if (path === "/timers/cancel" && options.method === "POST") throw new Error("cancel failed");
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    await wrapper.get("button.danger").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not cancel the timer.");
    expect(wrapper.text()).toContain("Stop session");
  });

  it("refreshes recent sessions after stopping the active timer", async () => {
    let stopped = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/calendar/labels") return [];
        if (path === "/timers/current")
          return stopped
            ? null
            : {
                id: "timer-a",
                pathId: "path-a",
                startedAt: "2026-08-25T10:00:00Z",
                description: "Focus session",
                running: true,
              };
        if (path === "/statistics")
          return {
            todaySeconds: stopped ? 1800 : 0,
            weekSeconds: stopped ? 1800 : 0,
            monthSeconds: stopped ? 1800 : 0,
            todayByPath: {},
            todayByLabel: {},
            weekByPath: stopped ? { "path-a": 1800 } : {},
            weekByLabel: {},
          };
        if (path === "/time-entries")
          return stopped
            ? [
                {
                  id: "entry-a",
                  pathId: "path-a",
                  startedAt: "2026-08-25T10:00:00Z",
                  endedAt: "2026-08-25T10:30:00Z",
                  durationSeconds: 1800,
                  description: "Finished focus session",
                },
              ]
            : [];
        if (path === "/timers/timer-a/stop" && options.method === "POST") {
          stopped = true;
          return {
            id: "timer-a",
            pathId: "path-a",
            startedAt: "2026-08-25T10:00:00Z",
            endedAt: "2026-08-25T10:30:00Z",
            durationSeconds: 1800,
            description: "Finished focus session",
            running: false,
          };
        }
        return undefined;
      },
    );
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.text()).toContain("Stop session");
    expect(wrapper.text()).toContain("No recorded sessions yet.");
    await wrapper.find("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-a/stop",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wrapper.text()).toContain("Start a session");
    expect(wrapper.text()).toContain("Finished focus session");
    expect(wrapper.text()).toContain("30 minutes");
    expect((wrapper.get('select[aria-label="Timer path"]').element as HTMLSelectElement).value).toBe("");
    expect((wrapper.get('textarea[aria-label="Timer description"]').element as HTMLTextAreaElement).value).toBe("");
    expect((wrapper.get('input[aria-label="New session label name"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.findComponent({ name: "VSelect" }).props("modelValue")).toEqual([]);
  });

  it("shows weekly time breakdowns by path and label", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/calendar/labels")
        return [{ id: "label-a", name: "Graphs", color: "#2878D5" }];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 3600,
          monthSeconds: 3600,
          todayByPath: {},
          todayByLabel: {},
          weekByPath: { "path-a": 3600 },
          weekByLabel: { "label-a": 1800 },
        };
      if (path === "/time-entries") return [];
      return undefined;
    });
    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.text()).toContain("TIME BY PATH THIS WEEK");
    expect(wrapper.text()).toContain("Algorithms");
    expect(wrapper.text()).toContain("TIME BY LABEL THIS WEEK");
    expect(wrapper.text()).toContain("Graphs");
  });

  it("shows a workspace error when the initial dashboard load fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to load your workspace.");
  });
});
