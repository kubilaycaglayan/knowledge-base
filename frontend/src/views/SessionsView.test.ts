import { config, flushPromises, mount } from "@vue/test-utils";
import SessionsView from "./SessionsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const timerStub = {
  props: ["inline"],
  template: '<div data-test="session-tracker" :data-inline="String(inline)"></div>',
};

describe("SessionsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => {
    config.global.stubs = { FloatingTimeTracker: timerStub };
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?"))
        return {
          page: 0,
          totalPages: 1,
          totalSessions: 2,
          sessions: [
          {
            id: "new",
            startedAt: "2026-08-27T11:00:00Z",
            endedAt: "2026-08-28T12:00:00Z",
            durationSeconds: 3600,
            description: "Most recent",
            source: "WEB",
            pathId: "path-1",
            labelIds: ["label-1"],
          },
          {
            id: "old",
            startedAt: "2026-08-28T11:00:00Z",
            endedAt: "2026-08-27T12:00:00Z",
            durationSeconds: 3600,
            description: "Older",
            source: "MANUAL",
          },
          ],
        };
      if (path === "/paths")
        return [{ id: "path-1", name: "Learning", description: "A path", status: "ACTIVE", color: "#2878D5" }];
      if (path === "/calendar/labels")
        return [{ id: "label-1", name: "Vue", color: "#2878D5" }];
      return undefined;
    });
  });

  afterEach(() => {
    config.global.stubs = {};
  });

  it("places the session tracker inline at the top of the sessions page", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();

    expect(wrapper.findComponent(timerStub).exists()).toBe(true);
    expect(wrapper.element.firstElementChild?.getAttribute("data-test")).toBe("session-tracker");
  });

  it("refreshes the sessions list when the tracker completes a session", async () => {
    let historyLoads = 0;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) {
        historyLoads++;
        return {
          page: 0,
          totalPages: 1,
          totalSessions: historyLoads === 1 ? 1 : 2,
          sessions: historyLoads === 1
            ? [{ id: "old", startedAt: "2026-08-27T11:00:00Z", endedAt: "2026-08-27T12:00:00Z", durationSeconds: 3600, source: "WEB" }]
            : [
                { id: "fresh", startedAt: "2026-08-28T12:00:00Z", endedAt: "2026-08-28T13:00:00Z", durationSeconds: 3600, source: "WEB", description: "Just completed" },
                { id: "old", startedAt: "2026-08-27T11:00:00Z", endedAt: "2026-08-27T12:00:00Z", durationSeconds: 3600, source: "WEB" },
              ],
        };
      }
      if (path === "/paths" || path === "/calendar/labels") return [];
      return undefined;
    });

    const wrapper = mount(SessionsView);
    await flushPromises();
    expect(wrapper.findAll("article.session-card")).toHaveLength(1);

    wrapper.findComponent(timerStub).vm.$emit("changed");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries?page=0&size=50");
    expect(wrapper.findAll("article.session-card")).toHaveLength(2);
    expect(wrapper.text()).toContain("Just completed");
  });

  it("reuses the cached session page when the view is mounted again", async () => {
    const first = mount(SessionsView);
    await flushPromises();
    const initialHistoryCalls = vi.mocked(api).mock.calls.filter(([path]) => path.startsWith("/time-entries?")).length;
    first.unmount();

    const second = mount(SessionsView);
    await flushPromises();

    expect(vi.mocked(api).mock.calls.filter(([path]) => path.startsWith("/time-entries?")).length).toBe(initialHistoryCalls);
    expect(second.findAll("article.session-card")).toHaveLength(2);
  });

  it("lists sessions by latest completion time with path and label context", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    const latestSession = wrapper.findAll("article.session-card")[0];
    expect(latestSession.get("h3").text()).toBe("Learning");
    expect(latestSession.get(".session-card-labels").text()).toBe("Vue");
    expect(latestSession.get(".session-description").text()).toBe("Most recent");
    expect(latestSession.get(".session-summary").findAll("span")[0].text()).toBe("1h");
    expect(latestSession.get(".session-title-chip").attributes("style")).toContain("--session-path-color: #2878D5");
  });

  it("groups sessions by relative dates before falling back to month and year", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) return {
        page: 0,
        totalPages: 1,
        totalSessions: 6,
        sessions: [
          "2026-09-11T09:00:00Z", "2026-09-10T09:00:00Z", "2026-09-09T09:00:00Z",
          "2026-09-03T09:00:00Z", "2026-08-30T09:00:00Z", "2026-07-31T09:00:00Z",
        ].map((startedAt, index) => ({ id: `${index}`, startedAt, endedAt: startedAt, source: "WEB" })),
      };
      if (path === "/paths" || path === "/calendar/labels") return [];
      return undefined;
    });

    try {
      const wrapper = mount(SessionsView);
      await flushPromises();
      expect(wrapper.findAll(".session-group-heading").map((heading) => heading.text())).toEqual([
        "Today", "Yesterday", "This week", "Last week", "Last month", "July 2026",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders multiple session labels and marks deleted references clearly", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) return {
        page: 0,
        totalPages: 1,
        totalSessions: 1,
        sessions: [{ id: "multi", startedAt: "2026-08-27T11:00:00Z", endedAt: "2026-08-27T12:00:00Z", durationSeconds: 3600, source: "WEB", labelIds: ["label-1", "removed-label"] }],
      };
      if (path === "/paths") return [];
      if (path === "/calendar/labels") return [{ id: "label-1", name: "Vue", color: null }];
      return undefined;
    });
    const wrapper = mount(SessionsView);
    await flushPromises();

    expect(wrapper.get(".session-card-labels").text()).toContain("Vue");
    expect(wrapper.get(".session-card-labels").text()).toContain("Removed label");
    await wrapper.get("button.text-button").trigger("click");
    expect(wrapper.get(".session-label-chips").text()).toContain("Vue");
    await wrapper.get(".session-label-chips button").trigger("click");
    await wrapper.get('select[aria-label="Add session label"]').setValue("label-1");
    expect(wrapper.get(".session-label-chips").text()).toContain("Vue");
  });

  it("updates every editable session property", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get('[aria-label="Edit session description"]').setValue("Updated");
    await wrapper.get('[aria-label="Edit session source"]').setValue("IOS");
    await wrapper.get('[aria-label="Edit session path"]').setValue("path-1");
    await wrapper.get('[aria-label="Remove Vue"]').trigger("click");
    await wrapper.get('[aria-label="Add session label"]').setValue("label-1");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries/new", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"source":"IOS"'),
    }));
  });

  it("confirms and soft-deletes a completed session", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();

    await wrapper.get("button.danger").trigger("click");
    expect(wrapper.find(".prompt-dialog").text()).toContain(
      "Remove this session? This cannot be undone.",
    );
    await wrapper.get(".prompt-dialog button.primary").trigger("click");

    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries/new", {
      method: "DELETE",
    });
  });

  it("loads the selected pagination page", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) return { page: path.includes("page=1") ? 1 : 0, totalPages: 2, totalSessions: 51, sessions: [] };
      if (path === "/paths" || path === "/calendar/labels") return [];
      return undefined;
    });
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get('nav[aria-label="Session pages"]').findAll("button")[1].trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries?page=1&size=50");
  });

  it("rejects an edit when either time field is missing", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get('input[aria-label="Edit session start"]').setValue("");
    await wrapper.get("form.session-edit").trigger("submit");

    expect(wrapper.get('[role="alert"]').text()).toBe("A session needs both a start and an end time.");
    expect(vi.mocked(api)).not.toHaveBeenCalledWith("/time-entries/new", expect.objectContaining({ method: "PUT" }));
  });

  it("shows an error when the initial session load fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const wrapper = mount(SessionsView);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to load sessions.");
  });

  it("reports update and removal failures", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path.startsWith("/time-entries?") && !options.method) return { page: 0, totalPages: 1, totalSessions: 1, sessions: [{ id: "session-1", startedAt: "2026-08-27T11:00:00Z", endedAt: "2026-08-27T12:00:00Z", durationSeconds: 3600, description: "Focus", source: "WEB" }] };
      if (path === "/paths" || path === "/calendar/labels") return [];
      throw new Error("mutation failed");
    });
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get("form.session-edit").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not update this session.");

    await wrapper.get("form.session-edit button.text-button").trigger("click");
    await wrapper.get("button.text-button.danger").trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not remove this session.");
  });

  it("marks a running session as running and prevents editing or removal", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) return { page: 0, totalPages: 1, totalSessions: 1, sessions: [{ id: "running", startedAt: "2026-08-27T11:00:00Z", source: "WEB", running: true }] };
      if (path === "/paths" || path === "/calendar/labels") return [];
      return undefined;
    });
    const wrapper = mount(SessionsView);
    await flushPromises();
    const card = wrapper.get("article.session-card");
    expect(card.text()).toContain("Running");
    expect(card.text()).toContain("Stop to edit");
    expect(card.find("button.danger").exists()).toBe(false);
    expect(card.find("button").attributes("disabled")).toBeDefined();
  });

  it("does not remove a session when confirmation is cancelled", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get("button.danger").trigger("click");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");

    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/time-entries/new" && options?.method === "DELETE")).toBe(false);
  });
});
