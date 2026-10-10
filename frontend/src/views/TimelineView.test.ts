import { flushPromises, mount } from "@vue/test-utils";
import TimelineView from "./TimelineView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("TimelineView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path.startsWith("/activities?")) return [];
      return undefined;
    });
  });

  it("requests the selected date preset and renders the empty state", async () => {
    const wrapper = mount(TimelineView);
    await flushPromises();

    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();

    const activityRequest = vi
      .mocked(api)
      .mock.calls.find(
        ([path]) => typeof path === "string" && path.includes("from="),
      );
    expect(activityRequest?.[0]).toMatch(
      /from=\d{4}-\d{2}-\d{2}T00%3A00%3A00Z&to=\d{4}-\d{2}-\d{2}T23%3A59%3A59Z/,
    );
    expect(wrapper.text()).toContain("No activity matches these filters.");
  });

  it("saves a note only on the selected activity", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path.startsWith("/activities?"))
        return [
          {
            id: "activity-1",
            type: "NOTE_CREATED",
            title: "First activity",
            occurredAt: "2026-08-25T12:00:00Z",
          },
          {
            id: "activity-2",
            type: "NOTE_CREATED",
            title: "Second activity",
            occurredAt: "2026-08-25T12:00:00Z",
          },
        ];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();

    const activity = wrapper
      .findAll("article.timeline-entry")
      .find((entry) => entry.text().includes("Second activity"));
    const addNoteButton = activity
      ?.findAll("button.text-button")
      .find((button) => button.text() === "Add note");
    expect(addNoteButton).toBeDefined();
    await addNoteButton!.trigger("click");
    await wrapper
      .get('input[aria-label="Activity note title"]')
      .setValue("Key idea");
    await wrapper
      .get('textarea[aria-label="Activity note content"]')
      .setValue("Spaced repetition helps.");
    const saveNoteButton = wrapper
      .findAll("button.primary")
      .find((button) => button.text() === "Save note");
    expect(saveNoteButton).toBeDefined();
    await saveNoteButton!.trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          activityId: "activity-2",
          title: "Key idea",
          content: "Spaced repetition helps.",
        }),
      }),
    );
  });

  it("supports the thirty-day and clear date presets", async () => {
    const wrapper = mount(TimelineView);
    await flushPromises();

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text().includes("30 days"))!
      .trigger("click");
    await flushPromises();
    const thirtyDayRequest = vi.mocked(api).mock.calls.at(-1)?.[0] as string;
    expect(thirtyDayRequest).toContain("from=");
    expect(thirtyDayRequest).toContain("to=");

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text().includes("All time"))!
      .trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe("/activities?");
  });

  it("attaches a note to the time entry when an activity provides one", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path.startsWith("/activities?"))
        return [
          {
            id: "activity-1",
            type: "TIMER_STOPPED",
            title: "Focus",
            occurredAt: "2026-08-25T12:00:00Z",
            timeEntryId: "entry-1",
          },
        ];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Add note")!
      .trigger("click");
    await wrapper
      .get('input[aria-label="Activity note title"]')
      .setValue("Timer insight");
    await wrapper
      .get('textarea[aria-label="Activity note content"]')
      .setValue("Keep this block focused.");
    await wrapper
      .findAll("button.primary")
      .find((button) => button.text() === "Save note")!
      .trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          timeEntryId: "entry-1",
          title: "Timer insight",
          content: "Keep this block focused.",
        }),
      }),
    );
  });

  it("submits activity, path, and date filters together", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [{ id: "path-1", name: "Learning" }];
      if (path.startsWith("/activities?")) return [];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper
      .get('select[aria-label="Activity type"]')
      .setValue("TIMER_STOPPED");
    await wrapper.get('select[aria-label="Path"]').setValue("path-1");
    await wrapper.get('input[aria-label="From date"]').setValue("2026-08-01");
    await wrapper.get('input[aria-label="To date"]').setValue("2026-08-31");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/activities?type=TIMER_STOPPED&pathId=path-1&from=2026-08-01T00%3A00%3A00Z&to=2026-08-31T23%3A59%3A59Z",
    );
  });

  it("limits timeline results to the selected activity type", async () => {
    const allActivities = [
      {
        id: "note-activity",
        type: "NOTE_CREATED",
        title: "Created research note",
        occurredAt: "2026-08-25T12:00:00Z",
      },
      {
        id: "timer-activity",
        type: "TIMER_STOPPED",
        title: "Completed focus session",
        occurredAt: "2026-08-25T13:00:00Z",
      },
    ];
    vi.mocked(api).mockImplementation(async (requestPath: string) => {
      if (requestPath === "/paths") return [];
      if (requestPath.startsWith("/activities?")) {
        const params = new URLSearchParams(requestPath.slice(requestPath.indexOf("?") + 1));
        return params.has("type")
          ? allActivities.filter((activity) => activity.type === params.get("type"))
          : allActivities;
      }
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    expect(wrapper.text()).toContain("Created research note");
    expect(wrapper.text()).toContain("Completed focus session");

    await wrapper
      .get('select[aria-label="Activity type"]')
      .setValue("TIMER_STOPPED");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Completed focus session");
    expect(wrapper.text()).not.toContain("Created research note");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/activities?type=TIMER_STOPPED",
    );
  });

  it("limits timeline results to the selected path", async () => {
    const allActivities = [
      {
        id: "learning-activity",
        type: "TIMER_STOPPED",
        title: "Learning session",
        occurredAt: "2026-08-25T12:00:00Z",
        pathId: "path-learning",
      },
      {
        id: "writing-activity",
        type: "TIMER_STOPPED",
        title: "Writing session",
        occurredAt: "2026-08-25T13:00:00Z",
        pathId: "path-writing",
      },
    ];
    vi.mocked(api).mockImplementation(async (requestPath: string) => {
      if (requestPath === "/paths")
        return [
          { id: "path-learning", name: "Learning" },
          { id: "path-writing", name: "Writing" },
        ];
      if (requestPath.startsWith("/activities?")) {
        const params = new URLSearchParams(requestPath.slice(requestPath.indexOf("?") + 1));
        return params.has("pathId")
          ? allActivities.filter((activity) => activity.pathId === params.get("pathId"))
          : allActivities;
      }
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    expect(wrapper.text()).toContain("Learning session");
    expect(wrapper.text()).toContain("Writing session");

    await wrapper.get('select[aria-label="Path"]').setValue("path-learning");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Learning session");
    expect(wrapper.text()).not.toContain("Writing session");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/activities?pathId=path-learning",
    );
  });

  it("shows the empty state when an applied filter has no matches", async () => {
    vi.mocked(api).mockImplementation(async (requestPath: string) => {
      if (requestPath === "/paths") return [];
      if (requestPath.startsWith("/activities?")) {
        return requestPath.includes("type=NOTE_CREATED")
          ? []
          : [
              {
                id: "timer-activity",
                type: "TIMER_STOPPED",
                title: "Completed focus session",
                occurredAt: "2026-08-25T13:00:00Z",
              },
            ];
      }
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    expect(wrapper.text()).toContain("Completed focus session");

    await wrapper
      .get('select[aria-label="Activity type"]')
      .setValue("NOTE_CREATED");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("No activity matches these filters.");
    expect(wrapper.text()).not.toContain("Completed focus session");
  });

  it("does not let an earlier filter response replace newer results", async () => {
    let resolveInitial!: (activities: unknown[]) => void;
    let resolveFiltered!: (activities: unknown[]) => void;
    vi.mocked(api).mockImplementation((requestPath: string) => {
      if (requestPath === "/paths") return Promise.resolve([]);
      if (requestPath.startsWith("/activities?")) {
        return new Promise((resolve) => {
          if (requestPath.includes("type=NOTE_CREATED"))
            resolveFiltered = resolve;
          else resolveInitial = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await vi.waitFor(() => expect(resolveInitial).toBeTypeOf("function"));

    await wrapper
      .get('select[aria-label="Activity type"]')
      .setValue("NOTE_CREATED");
    await wrapper.get("form.filters").trigger("submit");
    await vi.waitFor(() => expect(resolveFiltered).toBeTypeOf("function"));

    resolveFiltered([
      {
        id: "newer-activity",
        type: "NOTE_CREATED",
        title: "Current filtered result",
        occurredAt: "2026-08-25T13:00:00Z",
      },
    ]);
    await flushPromises();
    expect(wrapper.text()).toContain("Current filtered result");

    resolveInitial([
      {
        id: "older-activity",
        type: "TIMER_STOPPED",
        title: "Stale unfiltered result",
        occurredAt: "2026-08-25T12:00:00Z",
      },
    ]);
    await flushPromises();

    expect(wrapper.text()).toContain("Current filtered result");
    expect(wrapper.text()).not.toContain("Stale unfiltered result");
  });

  it("rejects a reversed date range without replacing current results", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path.startsWith("/activities?"))
        return [
          {
            id: "existing-activity",
            type: "NOTE_CREATED",
            title: "Existing timeline result",
            occurredAt: "2026-08-15T12:00:00Z",
          },
        ];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    const activityRequestCount = vi.mocked(api).mock.calls.filter(
      ([path]) => typeof path === "string" && path.startsWith("/activities?"),
    ).length;
    expect(wrapper.text()).toContain("Existing timeline result");

    await wrapper.get('input[aria-label="From date"]').setValue("2026-08-31");
    await wrapper.get('input[aria-label="To date"]').setValue("2026-08-01");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "The end date must be on or after the start date.",
    );
    expect(
      vi.mocked(api).mock.calls.filter(
        ([path]) => typeof path === "string" && path.startsWith("/activities?"),
      ),
    ).toHaveLength(activityRequestCount);
    expect(wrapper.text()).toContain("Existing timeline result");

    await wrapper.get('input[aria-label="From date"]').setValue("2026-08-01");
    await wrapper.get('input[aria-label="To date"]').setValue("2026-08-31");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(
      vi.mocked(api).mock.calls.filter(
        ([path]) => typeof path === "string" && path.startsWith("/activities?"),
      ),
    ).toHaveLength(activityRequestCount + 1);
  });

  it("clears all timeline filters back to the default state", async () => {
    const activities = [
      {
        id: "activity-1",
        type: "TIMER_STOPPED",
        title: "Learning session",
        occurredAt: "2026-08-15T12:00:00Z",
        pathId: "path-1",
      },
      {
        id: "activity-2",
        type: "NOTE_CREATED",
        title: "General note",
        occurredAt: "2026-08-20T12:00:00Z",
      },
    ];
    vi.mocked(api).mockImplementation(async (requestPath: string) => {
      if (requestPath === "/paths") return [{ id: "path-1", name: "Learning" }];
      if (requestPath.startsWith("/activities?")) {
        const params = new URLSearchParams(requestPath.slice(requestPath.indexOf("?") + 1));
        return params.has("type") || params.has("pathId") || params.has("from") || params.has("to")
          ? activities.slice(0, 1)
          : activities;
      }
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper.get('select[aria-label="Activity type"]').setValue("TIMER_STOPPED");
    await wrapper.get('select[aria-label="Path"]').setValue("path-1");
    await wrapper.get('input[aria-label="From date"]').setValue("2026-08-01");
    await wrapper.get('input[aria-label="To date"]').setValue("2026-08-31");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).not.toContain("General note");

    await wrapper.get("button.clear-timeline-filters").trigger("click");
    await flushPromises();

    expect(wrapper.get('select[aria-label="Activity type"]').element.value).toBe("");
    expect(wrapper.get('select[aria-label="Path"]').element.value).toBe("");
    expect(wrapper.get('input[aria-label="From date"]').element.value).toBe("");
    expect(wrapper.get('input[aria-label="To date"]').element.value).toBe("");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/activities?");
    expect(wrapper.text()).toContain("General note");
  });

  it("reports initial-load and note-save failures and ignores incomplete notes", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("paths failed"));
    const failedLoad = mount(TimelineView);
    await flushPromises();
    expect(failedLoad.get('[role="alert"]').text()).toBe(
      "Unable to load activity.",
    );

    let noteSaveAttempts = 0;
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths") return [];
        if (path.startsWith("/activities?"))
          return [
            {
              id: "activity-1",
              type: "NOTE_CREATED",
              title: "Read chapter",
              occurredAt: "2026-08-25T12:00:00Z",
            },
          ];
        if (path === "/notes" && options?.method === "POST") {
          noteSaveAttempts += 1;
          if (noteSaveAttempts === 1) throw new Error("note failed");
        }
        return undefined;
      },
    );
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Add note")!
      .trigger("click");
    await wrapper.get('input[aria-label="Activity note title"]').setValue(" ");
    await wrapper
      .get('textarea[aria-label="Activity note content"]')
      .setValue(" ");
    await wrapper
      .findAll("button.primary")
      .find((button) => button.text() === "Save note")!
      .trigger("click");
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path, options]) => path === "/notes" && options?.method === "POST",
        ),
    ).toBe(false);

    await wrapper
      .get('input[aria-label="Activity note title"]')
      .setValue("Insight");
    await wrapper
      .get('textarea[aria-label="Activity note content"]')
      .setValue("Content");
    await wrapper
      .findAll("button.primary")
      .find((button) => button.text() === "Save note")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Could not save activity note.",
    );
    expect(
      (wrapper.get('input[aria-label="Activity note title"]')
        .element as HTMLInputElement).value,
    ).toBe("Insight");
    expect(
      (wrapper.get('textarea[aria-label="Activity note content"]')
        .element as HTMLTextAreaElement).value,
    ).toBe("Content");

    await wrapper
      .findAll("button.primary")
      .find((button) => button.text() === "Save note")!
      .trigger("click");
    await flushPromises();
    expect(noteSaveAttempts).toBe(2);
    expect(
      wrapper.find('input[aria-label="Activity note title"]').exists(),
    ).toBe(false);
  });

  it("closes an activity note editor without saving", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path.startsWith("/activities?"))
        return [
          {
            id: "activity-1",
            type: "NOTE_CREATED",
            title: "Read chapter",
            occurredAt: "2026-08-25T12:00:00Z",
          },
        ];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Add note")!
      .trigger("click");
    expect(
      wrapper.find('input[aria-label="Activity note title"]').exists(),
    ).toBe(true);
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Cancel")!
      .trigger("click");
    expect(
      wrapper.find('input[aria-label="Activity note title"]').exists(),
    ).toBe(false);
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Add note")!
      .trigger("click");
    expect(
      (wrapper.get('input[aria-label="Activity note title"]')
        .element as HTMLInputElement).value,
    ).toBe("");
    expect(
      (wrapper.get('textarea[aria-label="Activity note content"]')
        .element as HTMLTextAreaElement).value,
    ).toBe("");
  });
});
