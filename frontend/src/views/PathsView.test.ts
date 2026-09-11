import { flushPromises, mount } from "@vue/test-utils";
import PathsView from "./PathsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("PathsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          {
            id: "path-1",
            name: "Algorithms",
            description: "Problem solving",
            color: "#E8754E",
            status: "ACTIVE",
          },
        ];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 120,
          recentActivity: [
            {
              id: "activity-1",
              title: "Imported Clockify session",
              detail: "Session: 2026-07-31T09:51:19Z – 2026-07-31T12:01:39Z",
              occurredAt: "2026-07-31T09:51:19Z",
            },
          ],
        };
      return undefined;
    });
  });

  it("shows tracked time and recent activity for a path", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".path-history-dialog").exists()).toBe(true);
    expect(wrapper.find(".path-history-dialog").text()).toContain(
      "PATH HISTORY",
    );
    expect(wrapper.find(".path-history-group-heading").exists()).toBe(true);
    expect(wrapper.text()).toContain(
      "2026-07-31T09:51:19Z – 2026-07-31T12:01:39Z",
    );
    expect(wrapper.find(".path-history-entry time").text()).toContain("31/07/2026");
    expect(wrapper.find(".path-history-entry .activity-duration").exists()).toBe(false);
    expect(wrapper.text()).toContain("2 minutes tracked");
  });

  it("shows backend-provided activity labels on paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "today", name: "Today", status: "ACTIVE", activityLabel: "today" },
          { id: "week", name: "Week", status: "ACTIVE", activityLabel: "this week" },
          { id: "month", name: "Month", status: "ACTIVE", activityLabel: "this month" },
          { id: "passive", name: "Passive", status: "ACTIVE", activityLabel: "passive" },
        ];
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.findAll(".activity-pill").map((pill) => pill.text())).toEqual([
      "today",
      "this week",
      "this month",
      "passive",
    ]);
  });

  it("closes path history from its dialog", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    const historyButton = wrapper.get("button.text-button");

    await historyButton.trigger("click");
    await flushPromises();
    expect(wrapper.find(".path-history-dialog").exists()).toBe(true);
    expect(historyButton.attributes("aria-haspopup")).toBe("dialog");

    await wrapper.get(".path-history-dialog button.text-button").trigger("click");
    expect(wrapper.find(".path-history-dialog").exists()).toBe(false);
  });

  it("opens the selected path history in one dialog", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          {
            id: "path-1",
            name: "Algorithms",
            description: "Problem solving",
            color: "#E8754E",
            status: "ACTIVE",
          },
          {
            id: "path-2",
            name: "Writing",
            description: "Clear communication",
            color: "#4C6FFF",
            status: "ACTIVE",
          },
        ];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 120,
          recentActivity: [],
        };
      if (path === "/paths/path-2/summary")
        return {
          path: { id: "path-2", name: "Writing", status: "ACTIVE" },
          trackedSeconds: 240,
          recentActivity: [],
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    const historyButtons = wrapper.findAll("button.text-button").filter(
      (button) => button.text() === "History",
    );

    await historyButtons[0].trigger("click");
    await flushPromises();
    expect(wrapper.get(".path-history-dialog").text()).toContain("Algorithms");
    await wrapper.get(".path-history-dialog button.text-button").trigger("click");
    await historyButtons[1].trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".path-history-dialog")).toHaveLength(1);
    expect(wrapper.get(".path-history-dialog").text()).toContain("Writing");
  });

  it("merges a completed timer into one activity with its details", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          {
            id: "path-1",
            name: "Algorithms",
            description: "Problem solving",
            color: "#E8754E",
            status: "ACTIVE",
          },
        ];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 120,
          recentActivity: [
            {
              id: "timer-stop",
              type: "TIMER_STOPPED",
              title: "Tracked 2000 seconds",
              detail: "Read graph algorithms",
              occurredAt: "2026-08-28T10:02:00Z",
            },
            {
              id: "timer-start",
              type: "TIMER_STARTED",
              title: "Started a timer",
              detail: "Read graph algorithms",
              occurredAt: "2026-08-28T10:00:00Z",
            },
          ],
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();

    const activityLine = wrapper.get(".path-history-entry");
    expect(activityLine.text()).toContain("33 minutes");
    expect(activityLine.text()).not.toContain("Tracked");
    expect(activityLine.text()).toContain("Read graph algorithms");
    expect(wrapper.text()).not.toContain("Started a timer");
  });

  it("makes URLs clickable in path and history descriptions", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Algorithms", description: "Read https://example.com/guide." , status: "ACTIVE" }];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 0,
          recentActivity: [{ id: "activity-1", title: "Session", detail: "See https://example.com/session", occurredAt: "2026-08-28T10:00:00Z" }],
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    expect(wrapper.get('a[href="https://example.com/guide"]').attributes("target")).toBe("_blank");
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();
    expect(wrapper.get('a[href="https://example.com/session"]').attributes("rel")).toBe("noopener noreferrer");
  });

  it("submits a selected path color from the shared palette", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('input[aria-label="New path name"]').setValue("Reading");
    await wrapper.get('button[aria-label="Choose path color"]').trigger("click");
    await wrapper
      .get('button[aria-label="Choose path color: Blue (#3B82F6)"]')
      .trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"color":"#3B82F6"'),
      }),
    );
  });

  it("edits path name description and color inline", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    await wrapper
      .get('input[aria-label="Edit path name"]')
      .setValue("Algorithms and Data Structures");
    await wrapper
      .get('textarea[aria-label="Edit path description"]')
      .setValue("CS fundamentals");
    await wrapper
      .get('button[aria-label="Choose edit path color"]')
      .trigger("click");
    await wrapper
      .get('button[aria-label="Set edit path color: Cyan (#06B6D4)"]')
      .trigger("click");
    await wrapper.get("form.path-edit").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Algorithms and Data Structures",
          description: "CS fundamentals",
          color: "#06B6D4",
        }),
      }),
    );
  });

  it("searches for a merge target, confirms the destructive merge, and refreshes paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths") return [
        { id: "path-1", name: "Algorithms", status: "ACTIVE" },
        { id: "path-2", name: "Writing", description: "Drafting", status: "ACTIVE" },
      ];
      if (path === "/paths/path-1/merge" && options?.method === "POST") return undefined;
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit")!.trigger("click");
    await wrapper.findAll("form.path-edit button").find((button) => button.text().trim() === "Merge")!.trigger("click");

    expect(wrapper.get(".merge-path-dialog").text()).toContain("Merge “Algorithms” into…");
    await wrapper.get('input[aria-label="Edit path name"]');
    await wrapper.get('#merge-path-search').setValue("writing");
    await wrapper.get('input[name="merge-target-path"]').setValue("path-2");
    await wrapper.get(".merge-path-dialog button.primary").trigger("click");
    expect(wrapper.get(".prompt-dialog").text()).toContain("Merge Algorithms into Writing?");
    expect(wrapper.find(".merge-path-dialog").exists()).toBe(false);
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths/path-1/merge", {
      method: "POST",
      body: JSON.stringify({ targetPathId: "path-2" }),
    });
    expect(wrapper.find(".merge-path-dialog").exists()).toBe(false);
  });

  it("closes the merge chooser without changing paths", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit")!.trigger("click");
    await wrapper.findAll("form.path-edit button").find((button) => button.text().trim() === "Merge")!.trigger("click");
    await wrapper.get(".merge-path-dialog button.text-button").trigger("click");

    expect(wrapper.find(".merge-path-dialog").exists()).toBe(false);
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("/merge"))).toBe(false);
  });

  it("confirms removal and offers a timed undo", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Remove")!
      .trigger("click");

    expect(wrapper.find(".prompt-dialog").text()).toContain(
      "Remove Algorithms? You can undo this for a few seconds.",
    );
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths/path-1", {
      method: "DELETE",
    });
    expect(wrapper.text()).toContain('Removed “Algorithms”.');
    expect(wrapper.get(".undo-snackbar").attributes("role")).toBe("status");
    expect(wrapper.get(".undo-snackbar").classes()).toContain("snackbar");
    await wrapper.get(".undo-snackbar button").trigger("click");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths/path-1/restore", {
      method: "POST",
    });
  });

  it("saves a note from path history", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();
    await wrapper.get('input[aria-label="Path note title"]').setValue("Graph insight");
    await wrapper.get('textarea[aria-label="Path note content"]').setValue("Use invariants to simplify proofs.");
    await wrapper.get("form.note-editor").trigger("submit");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ pathId: "path-1", title: "Graph insight", content: "Use invariants to simplify proofs." }),
    }));
  });

  it("reports a path-note save failure", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths") return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/paths/path-1/summary") return { path: { id: "path-1", name: "Algorithms", status: "ACTIVE" }, trackedSeconds: 0, recentActivity: [] };
      if (path === "/notes" && options?.method === "POST") throw new Error("save failed");
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();
    await wrapper.get('input[aria-label="Path note title"]').setValue("Insight");
    await wrapper.get('textarea[aria-label="Path note content"]').setValue("Content");
    await wrapper.get("form.note-editor").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not save path note.");
  });

  it("reports an undo failure after removing a path", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths") return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/paths/path-1" && options?.method === "DELETE") return undefined;
      if (path === "/paths/path-1/restore" && options?.method === "POST") throw new Error("restore failed");
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Remove")!.trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await wrapper.get(".undo-snackbar button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not undo path removal.");
  });

  it("reports initial load, path creation, and history failures", async () => {
    vi.mocked(api).mockRejectedValue(new Error("load failed"));
    const failedLoad = mount(PathsView);
    await flushPromises();
    expect(failedLoad.get('[role="alert"]').text()).toBe("Unable to load paths.");

    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths" && !options) return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/paths" && options?.method === "POST") throw new Error("create failed");
      if (path === "/paths/path-1/summary") throw new Error("summary failed");
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('input[aria-label="New path name"]').setValue("New path");
    await wrapper.get("form.path-form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create path.");

    await wrapper.findAll("button.text-button").find((button) => button.text() === "History")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not load path history.");
  });

  it("does not remove a path when the confirmation is cancelled", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Remove")!.trigger("click");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");

    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/paths/path-1" && options?.method === "DELETE")).toBe(false);
    expect(wrapper.find(".undo-snackbar").exists()).toBe(false);
  });

  it("cancels inline path editing without saving", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit")!.trigger("click");
    await wrapper.get('input[aria-label="Edit path name"]').setValue("Unsaved name");
    await wrapper.findAll("form.path-edit button.text-button").find((button) => button.text().trim() === "Cancel")!.trigger("click");

    expect(wrapper.find("form.path-edit").exists()).toBe(false);
    expect(wrapper.text()).toContain("Algorithms");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/paths/path-1" && options?.method === "PUT")).toBe(false);
  });

  it("does not offer removal for inactive paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [{ id: "archived", name: "Archived", status: "ARCHIVED" }];
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.text()).toContain("archived");
    expect(wrapper.find("button.danger").exists()).toBe(false);
  });

  it("reports a path removal failure without showing an undo snackbar", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths") return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/paths/path-1" && options?.method === "DELETE") throw new Error("remove failed");
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Remove")!.trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not remove path.");
    expect(wrapper.find(".undo-snackbar").exists()).toBe(false);
  });
});
