import { flushPromises, mount } from "@vue/test-utils";
import PathsView from "./PathsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("PathsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
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
              timeEntryId: "session-1",
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
    expect(wrapper.find(".path-history-entry time").text()).toContain(
      "31/07/2026",
    );
    expect(
      wrapper.find(".path-history-entry .activity-duration").exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain("2 minutes tracked");
  });

  it("opens and saves the session editor from path history", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths")
          return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/paths/path-1/summary")
          return {
            path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
            trackedSeconds: 120,
            recentActivity: [
              {
                id: "activity-1",
                timeEntryId: "session-1",
                title: "Tracked 120 seconds",
                occurredAt: "2026-07-31T12:01:39Z",
              },
            ],
          };
        if (path === "/time-entries/session-1" && !options?.method)
          return {
            id: "session-1",
            pathId: "path-1",
            labelIds: [],
            startedAt: "2026-07-31T09:51:19Z",
            endedAt: "2026-07-31T12:01:39Z",
            description: "Focus",
            source: "IMPORT",
          };
        return undefined;
      },
    );
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .get('button.text-button[aria-haspopup="dialog"]')
      .trigger("click");
    await flushPromises();
    await wrapper.get(".path-history-edit").trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toContain(
      "/time-entries/session-1",
    );
    expect(wrapper.find(".session-edit-dialog").exists()).toBe(true);
    await wrapper
      .get('[aria-label="Edit session description"]')
      .setValue("Updated focus");
    await wrapper.get(".session-edit-dialog form").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/time-entries/session-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"description":"Updated focus"'),
      }),
    );
  });

  it("reuses cached paths when the view is mounted again", async () => {
    const first = mount(PathsView);
    await flushPromises();
    first.unmount();

    mount(PathsView);
    await flushPromises();

    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === "/paths"),
    ).toHaveLength(1);
  });

  it("shows backend-provided activity labels on paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          {
            id: "today",
            name: "Today",
            status: "ACTIVE",
            activityLabel: "today",
          },
          {
            id: "week",
            name: "Week",
            status: "ACTIVE",
            activityLabel: "this week",
          },
          {
            id: "month",
            name: "Month",
            status: "ACTIVE",
            activityLabel: "this month",
          },
          {
            id: "passive",
            name: "Passive",
            status: "ACTIVE",
            activityLabel: "passive",
          },
        ];
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();

    expect(
      wrapper.findAll(".activity-pill").map((pill) => pill.text()),
    ).toEqual(["today", "this week", "this month", "passive"]);
  });

  it("closes path history from its dialog", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    const historyButton = wrapper.get("button.text-button");

    await historyButton.trigger("click");
    await flushPromises();
    expect(wrapper.find(".path-history-dialog").exists()).toBe(true);
    expect(historyButton.attributes("aria-haspopup")).toBe("dialog");

    await wrapper
      .get(".path-history-dialog button.text-button")
      .trigger("click");
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
    const historyButtons = wrapper
      .findAll("button.text-button")
      .filter((button) => button.text() === "History");

    await historyButtons[0].trigger("click");
    await flushPromises();
    expect(wrapper.get(".path-history-dialog").text()).toContain("Algorithms");
    await wrapper
      .get(".path-history-dialog button.text-button")
      .trigger("click");
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
        return [
          {
            id: "path-1",
            name: "Algorithms",
            description: "Read https://example.com/guide.",
            status: "ACTIVE",
          },
        ];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 0,
          recentActivity: [
            {
              id: "activity-1",
              title: "Session",
              detail: "See https://example.com/session",
              occurredAt: "2026-08-28T10:00:00Z",
            },
          ],
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    expect(
      wrapper.get('a[href="https://example.com/guide"]').attributes("target"),
    ).toBe("_blank");
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();
    expect(
      wrapper.get('a[href="https://example.com/session"]').attributes("rel"),
    ).toBe("noopener noreferrer");
  });

  it("submits a selected path color from the shared palette", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    await wrapper.get('input[aria-label="New path name"]').setValue("Reading");
    await wrapper
      .get('button[aria-label="Choose path color: Blue (#3B82F6)"]')
      .trigger("click");
    await wrapper.get("form.path-create-form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"color":"#3B82F6"'),
      }),
    );
  });

  it("pins paths and persists keyboard-accessible ordering", async () => {
    let pinned = false;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths")
        return [
          { id: "path-1", name: "Algorithms", status: "ACTIVE", pinned },
          { id: "path-2", name: "Writing", status: "ACTIVE", pinned: false },
        ];
      if (path === "/paths/path-1/pin") {
        pinned = true;
        return { id: "path-1", name: "Algorithms", status: "ACTIVE", pinned };
      }
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    await wrapper.get(".path-pin-button").trigger("click");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1/pin",
      expect.objectContaining({ body: '{"pinned":true}' }),
    );
    expect(wrapper.get(".path-pin-button").attributes("aria-label")).toBe(
      "Unpin Algorithms",
    );
    expect(wrapper.findAll(".path-order-button")).toHaveLength(0);
  });

  it("keeps long path titles on one truncated line", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          {
            id: "long-path",
            name: "A very long path title that should stay on one line",
            status: "ACTIVE",
          },
        ];
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.get(".path-title").text()).toContain("A very long path");
    expect(wrapper.get(".path-title").classes()).toContain("path-title");
  });

  it("hides the pin control while editing a path", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    expect(wrapper.find(".path-pin-button").exists()).toBe(true);

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");

    expect(wrapper.find(".path-pin-button").exists()).toBe(false);
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
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths")
          return [
            { id: "path-1", name: "Algorithms", status: "ACTIVE" },
            {
              id: "path-2",
              name: "Writing",
              description: "Drafting",
              status: "ACTIVE",
            },
          ];
        if (path === "/paths/path-1/merge" && options?.method === "POST")
          return undefined;
        return undefined;
      },
    );
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    await wrapper
      .findAll("form.path-edit button")
      .find((button) => button.text().trim() === "Merge")!
      .trigger("click");

    expect(wrapper.get(".merge-path-dialog").text()).toContain(
      "Merge “Algorithms” into…",
    );
    await wrapper.get('input[aria-label="Edit path name"]');
    await wrapper.get("#merge-path-search").setValue("writing");
    await wrapper.get('input[name="merge-target-path"]').setValue("path-2");
    await wrapper.get(".merge-path-dialog button.primary").trigger("click");
    expect(wrapper.get(".prompt-dialog").text()).toContain(
      "Merge Algorithms into Writing?",
    );
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
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    await wrapper
      .findAll("form.path-edit button")
      .find((button) => button.text().trim() === "Merge")!
      .trigger("click");
    await wrapper.get(".merge-path-dialog button.text-button").trigger("click");

    expect(wrapper.find(".merge-path-dialog").exists()).toBe(false);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).includes("/merge")),
    ).toBe(false);
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
    expect(wrapper.text()).toContain("Removed “Algorithms”.");
    expect(wrapper.get(".undo-snackbar").attributes("role")).toBe("status");
    expect(wrapper.get(".undo-snackbar").classes()).toContain("snackbar");
    await wrapper.get(".undo-snackbar button").trigger("click");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths/path-1/restore", {
      method: "POST",
    });
  });

  it("reports an undo failure after removing a path", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths")
          return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/paths/path-1" && options?.method === "DELETE")
          return undefined;
        if (path === "/paths/path-1/restore" && options?.method === "POST")
          throw new Error("restore failed");
        return undefined;
      },
    );
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Remove")!
      .trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await wrapper.get(".undo-snackbar button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Could not undo path removal.",
    );
  });

  it("reports initial load, path creation, and history failures", async () => {
    vi.mocked(api).mockRejectedValue(new Error("load failed"));
    const failedLoad = mount(PathsView);
    await flushPromises();
    expect(failedLoad.get('[role="alert"]').text()).toBe(
      "Unable to load paths.",
    );

    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths" && !options)
          return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/paths" && options?.method === "POST")
          throw new Error("create failed");
        if (path === "/paths/path-1/summary") throw new Error("summary failed");
        return undefined;
      },
    );
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    await wrapper.get('input[aria-label="New path name"]').setValue("New path");
    await wrapper.get("form.path-create-form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create path.");

    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "History")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Could not load path history.",
    );
  });

  it("does not remove a path when the confirmation is cancelled", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Remove")!
      .trigger("click");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");

    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path, options]) =>
            path === "/paths/path-1" && options?.method === "DELETE",
        ),
    ).toBe(false);
    expect(wrapper.find(".undo-snackbar").exists()).toBe(false);
  });

  it("cancels inline path editing without saving", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    await wrapper
      .get('input[aria-label="Edit path name"]')
      .setValue("Unsaved name");
    await wrapper
      .findAll("form.path-edit button.text-button")
      .find((button) => button.text().trim() === "Cancel")!
      .trigger("click");

    expect(wrapper.find("form.path-edit").exists()).toBe(false);
    expect(wrapper.text()).toContain("Algorithms");
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path, options]) =>
            path === "/paths/path-1" && options?.method === "PUT",
        ),
    ).toBe(false);
  });

  it("does not offer removal for inactive paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "archived", name: "Archived", status: "ARCHIVED" }];
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.text()).toContain("Archived");
    expect(wrapper.find("button.danger").exists()).toBe(false);
  });

  it("reports a path removal failure without showing an undo snackbar", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths")
          return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
        if (path === "/paths/path-1" && options?.method === "DELETE")
          throw new Error("remove failed");
        return undefined;
      },
    );
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Remove")!
      .trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not remove path.");
    expect(wrapper.find(".undo-snackbar").exists()).toBe(false);
  });

  describe("show on board (PB-25 – PB-27)", () => {
    const calls = () => vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/visibility"));
    beforeEach(() => {
      vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
        if (path === "/paths")
          return [{ id: "path-1", name: "Algorithms", status: "ACTIVE", boardId: "board-1", boardHidden: false }];
        if (path === "/boards/board-1/visibility")
          return { id: "board-1", name: "Algorithms", archived: false, pathId: "path-1", pinned: false, hidden: JSON.parse(String(options?.body)).hidden };
        return undefined;
      });
    });
    async function openEdit() {
      const confirmSpy = vi.spyOn(window, "confirm");
      const promptSpy = vi.spyOn(window, "prompt");
      const wrapper = mount(PathsView, { attachTo: document.body });
      await flushPromises();
      await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit")!.trigger("click");
      return { wrapper, confirmSpy, promptSpy, toggle: () => wrapper.find<HTMLInputElement>('form.path-edit input[name="boardVisible"]') };
    }

    it("shows the board visibility switch", async () => {
      const { wrapper, toggle } = await openEdit();
      expect(toggle().exists()).toBe(true);
      expect(toggle().attributes("role")).toBe("switch");
      expect(toggle().element.checked).toBe(true);
      expect(wrapper.find('form.path-edit label[for="' + toggle().attributes("id") + '"]').text()).toContain("Show on board");
      wrapper.unmount();
    });

    it("turning the board switch on saves immediately", async () => {
      vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
        if (path === "/paths") return [{ id: "path-1", name: "Algorithms", status: "ACTIVE", boardId: "board-1", boardHidden: true }];
        if (path === "/boards/board-1/visibility") return { id: "board-1", hidden: JSON.parse(String(options?.body)).hidden };
        return undefined;
      });
      const { wrapper, toggle } = await openEdit();
      expect(toggle().element.checked).toBe(false);
      await toggle().setValue(true);
      await flushPromises();
      expect(calls()).toEqual([["/boards/board-1/visibility", expect.objectContaining({ method: "POST", body: JSON.stringify({ hidden: false }) })]]);
      expect(wrapper.find(".prompt-dialog").exists()).toBe(false);
      expect(wrapper.find('[aria-live="polite"]').text()).toContain("Algorithms board is shown");
      wrapper.unmount();
    });

    it("turning the board switch off asks for confirmation", async () => {
      const { wrapper, toggle, confirmSpy, promptSpy } = await openEdit();
      await toggle().setValue(false);
      await flushPromises();
      expect(calls()).toHaveLength(0);
      const dialog = wrapper.find(".prompt-dialog");
      expect(dialog.exists()).toBe(true);
      expect(dialog.text()).toContain("Hide the “Algorithms” board?");
      await dialog.find(".primary").trigger("click");
      await flushPromises();
      expect(calls()).toEqual([["/boards/board-1/visibility", expect.objectContaining({ method: "POST", body: JSON.stringify({ hidden: true }) })]]);
      expect(toggle().element.checked).toBe(false);
      expect(wrapper.find('[aria-live="polite"]').text()).toContain("Algorithms board is hidden");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(promptSpy).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it("labels the hide confirmation button Hide board", async () => {
      const { wrapper, toggle } = await openEdit();
      await toggle().setValue(false);
      await flushPromises();
      expect(wrapper.find(".prompt-dialog .primary").text()).toBe("Hide board");
      wrapper.unmount();
    });

    it("cancelling the hide confirmation keeps the board visible", async () => {
      const { wrapper, toggle } = await openEdit();
      await toggle().setValue(false);
      await flushPromises();
      await wrapper.find(".prompt-dialog .text-button").trigger("click");
      await flushPromises();
      expect(calls()).toHaveLength(0);
      expect(toggle().element.checked).toBe(true);
      expect(document.activeElement).toBe(toggle().element);
      wrapper.unmount();
    });
  });
});

