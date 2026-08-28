import { flushPromises, mount } from "@vue/test-utils";
import DashboardView from "./DashboardView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("DashboardView timer flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths") return [];
        if (path === "/items") return [];
        if (path === "/timers/current") return null;
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByItem: {},
            completedItems: 0,
            activeItems: 0,
            recentProgressChanges: [],
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

  it("starts a server timer and can cancel the active session", async () => {
    const wrapper = mount(DashboardView);
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

  it("keeps session start controls at the top of the dashboard", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();

    expect(wrapper.find("section").classes()).toContain("session-grid");
    expect(wrapper.find("section").text()).toContain("FOCUS TODAY");
  });

  it("only offers items attached to the selected timer path", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "path-a", name: "Algorithms", status: "ACTIVE" },
          { id: "path-b", name: "Writing", status: "ACTIVE" },
        ];
      if (path === "/items")
        return [
          { id: "item-a", title: "Graphs", pathIds: ["path-a"] },
          { id: "item-b", title: "Essays", pathIds: ["path-b"] },
        ];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByItem: {},
          completedItems: 0,
          activeItems: 0,
          recentProgressChanges: [],
        };
      if (path === "/time-entries") return [];
      return undefined;
    });
    const wrapper = mount(DashboardView);
    await flushPromises();

    await wrapper.get('select[aria-label="Timer path"]').setValue("path-a");
    const options = wrapper
      .get('select[aria-label="Timer item"]')
      .findAll("option")
      .map((option) => option.text());
    expect(options).toContain("Graphs");
    expect(options).not.toContain("Essays");
  });

  it("creates a new item from the session flow and selects it", async () => {
    let created = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/items" && options.method === "POST") {
          created = true;
          return {
            id: "item-new",
            title: "Dijkstra notes",
            pathIds: ["path-a"],
          };
        }
        if (path === "/items")
          return created
            ? [{ id: "item-new", title: "Dijkstra notes", pathIds: ["path-a"] }]
            : [];
        if (path === "/timers/current") return null;
        if (path === "/statistics")
          return {
            todaySeconds: 0,
            weekSeconds: 0,
            monthSeconds: 0,
            todayByPath: {},
            todayByItem: {},
            completedItems: 0,
            activeItems: 0,
            recentProgressChanges: [],
          };
        if (path === "/time-entries") return [];
        return undefined;
      },
    );
    const wrapper = mount(DashboardView);
    await flushPromises();

    await wrapper.get('select[aria-label="Timer path"]').setValue("path-a");
    await wrapper
      .get('input[aria-label="New session item title"]')
      .setValue("Dijkstra notes");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Create item")!
      .trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Dijkstra notes",
          type: "CUSTOM",
          pathIds: ["path-a"],
          tags: [],
        }),
      }),
    );
    expect(
      (
        wrapper.get('select[aria-label="Timer item"]')
          .element as HTMLSelectElement
      ).value,
    ).toBe("item-new");
  });

  it("keeps active timer configuration controls visible and editable", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/items")
          return [{ id: "item-a", title: "Graphs", pathIds: ["path-a"] }];
        if (path === "/timers/current")
          return {
            id: "timer-a",
            pathId: "path-a",
            itemId: "item-a",
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
            todayByItem: {},
            completedItems: 0,
            activeItems: 0,
            recentProgressChanges: [],
          };
        if (path === "/time-entries") return [];
        if (path === "/timers/timer-a" && options.method === "PUT")
          return {
            id: "timer-a",
            pathId: "path-a",
            itemId: "item-a",
            startedAt: "2026-08-25T09:30:00Z",
            description: "Updated focus",
            running: true,
          };
        return undefined;
      },
    );
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.find('input[aria-label="Timer start"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Save timer settings");
    await wrapper
      .find('input[aria-label="Timer start"]')
      .setValue("2026-08-25T09:30");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-a",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("updates the running clock when its start time is moved earlier", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-25T12:00:00Z") });
    let startedAt = "2026-08-25T11:00:00Z";
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths") return [];
        if (path === "/items") return [];
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
            todayByItem: {},
            completedItems: 0,
            activeItems: 0,
            recentProgressChanges: [],
          };
        if (path === "/time-entries") return [];
        if (path === "/timers/timer-a" && options.method === "PUT") {
          startedAt = "2026-08-25T10:00:00Z";
          return { id: "timer-a", startedAt, description: "Focus", running: true };
        }
        return undefined;
      },
    );

    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.find(".focus strong").text()).toBe("01:00:00");

    await wrapper.find('input[aria-label="Timer start"]').setValue("2026-08-25T10:00");
    await flushPromises();

    expect(wrapper.find(".focus strong").text()).toBe("02:00:00");
    vi.useRealTimers();
  });

  it("shows the path and shortened description for recent sessions", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/items") return [];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          todayByPath: {},
          todayByItem: {},
          completedItems: 0,
          activeItems: 0,
          recentProgressChanges: [],
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
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Algorithms");
    expect(wrapper.text()).toContain("A very long session description");
    expect(wrapper.text()).toContain("…");
  });

  it("refreshes recent sessions after stopping the active timer", async () => {
    let stopped = false;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths")
          return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/items") return [];
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
            todayByItem: {},
            weekByPath: stopped ? { "path-a": 1800 } : {},
            weekByItem: {},
            completedItems: 0,
            activeItems: 0,
            recentProgressChanges: [],
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
    const wrapper = mount(DashboardView);
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
    expect(wrapper.text()).toContain("1800s");
  });

  it("shows weekly time breakdowns by path and item", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-a", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/items")
        return [{ id: "item-a", title: "Graphs", pathIds: ["path-a"] }];
      if (path === "/timers/current") return null;
      if (path === "/statistics")
        return {
          todaySeconds: 0,
          weekSeconds: 3600,
          monthSeconds: 3600,
          todayByPath: {},
          todayByItem: {},
          weekByPath: { "path-a": 3600 },
          weekByItem: { "item-a": 1800 },
          completedItems: 0,
          activeItems: 1,
          recentProgressChanges: [],
        };
      if (path === "/time-entries") return [];
      return undefined;
    });
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("TIME BY PATH THIS WEEK");
    expect(wrapper.text()).toContain("Algorithms");
    expect(wrapper.text()).toContain("TIME BY ITEM THIS WEEK");
    expect(wrapper.text()).toContain("Graphs");
  });
});
