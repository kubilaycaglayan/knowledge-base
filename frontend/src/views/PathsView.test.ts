import { flushPromises, mount } from "@vue/test-utils";
import PathsView from "./PathsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("PathsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    usePathsStore().reset();
    useLabelsStore().reset();
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

  it("shows an empty paths state with a path creation action", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.findAll(".path-title")).toHaveLength(0);
    expect(wrapper.find(".empty").text()).toBe(
      "Your first path is waiting to be named.",
    );
    expect(wrapper.find('button[aria-label="Add path"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    expect(wrapper.get('[role="dialog"] h2').text()).toBe("Add a path");
  });

  it("announces path loading and then shows the valid empty state", async () => {
    let resolvePaths!: (paths: never[]) => void;
    const pendingPaths = new Promise<never[]>((resolve) => {
      resolvePaths = resolve;
    });
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return pendingPaths;
      if (path === "/labels?scope=TIME_ENTRY") return [];
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();

    expect(wrapper.get(".path-list").attributes("aria-busy")).toBe("true");
    expect(wrapper.get('.path-loading[role="status"]').text()).toBe(
      "Loading paths…",
    );
    expect(wrapper.find(".empty").exists()).toBe(false);

    resolvePaths([]);
    await flushPromises();

    expect(wrapper.get(".path-list").attributes("aria-busy")).toBe("false");
    expect(wrapper.find('.path-loading[role="status"]').exists()).toBe(false);
    expect(wrapper.get(".empty").text()).toBe(
      "Your first path is waiting to be named.",
    );
  });

  it("shows an explicit empty state for a path history without activity", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Algorithms", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 0,
          recentActivity: [],
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .get('button.text-button[aria-haspopup="dialog"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.get(".path-history-dialog").text()).toContain(
      "No recent activity yet.",
    );
    expect(wrapper.findAll(".path-history-entry")).toHaveLength(0);
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

  it("shows only the selected path sessions grouped with timestamps and labels", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [
          { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          { id: "path-2", name: "Writing", status: "ACTIVE" },
        ];
      if (path === "/labels?scope=TIME_ENTRY")
        return [{ id: "label-draft", name: "Draft", scopes: ["TIME_ENTRY"] }];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          trackedSeconds: 60,
          recentActivity: [
            {
              id: "private-session",
              timeEntryId: "entry-private",
              title: "Private algorithm session",
              occurredAt: "2020-08-29T10:00:00Z",
            },
          ],
        };
      if (path === "/paths/path-2/summary")
        return {
          path: { id: "path-2", name: "Writing", status: "ACTIVE" },
          trackedSeconds: 180,
          recentActivity: [
            {
              id: "writing-session-newer",
              timeEntryId: "entry-newer",
              title: "Draft introduction",
              occurredAt: "2020-08-28T10:00:00Z",
              labelIds: ["label-draft"],
            },
            {
              id: "writing-session-older",
              timeEntryId: "entry-older",
              title: "Review outline",
              occurredAt: "2020-07-28T10:00:00Z",
            },
          ],
        };
      if (path === "/time-entries/entry-newer")
        return {
          id: "entry-newer",
          pathId: "path-2",
          labelIds: ["label-draft"],
          startedAt: "2020-08-28T09:00:00Z",
          endedAt: "2020-08-28T10:00:00Z",
          durationSeconds: 3600,
          description: "Draft introduction",
          source: "WEB",
        };
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    const writingHistory = wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "History" && button.element.parentElement?.parentElement?.textContent?.includes("Writing"));
    expect(writingHistory).toBeDefined();
    await writingHistory!.trigger("click");
    await flushPromises();

    const dialog = wrapper.get(".path-history-dialog");
    expect(dialog.text()).toContain("Writing");
    expect(dialog.text()).toContain("Draft introduction");
    expect(dialog.text()).toContain("Review outline");
    expect(dialog.text()).toContain("Draft");
    expect(dialog.text()).not.toContain("Private algorithm session");
    expect(dialog.findAll(".path-history-group-heading").map((heading) => heading.text())).toEqual([
      "August 2020",
      "July 2020",
    ]);
    expect(dialog.find('time[datetime="2020-08-28T10:00:00Z"]').exists()).toBe(true);
    expect(dialog.find('time[datetime="2020-07-28T10:00:00Z"]').exists()).toBe(true);

    await dialog.find("button.path-history-edit").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries/entry-newer");
    expect(wrapper.get(".session-edit-dialog").text()).toContain("Edit session");
    expect(
      wrapper.get<HTMLTextAreaElement>('[aria-label="Edit session description"]').element.value,
    ).toBe("Draft introduction");
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
    const descriptionLink = wrapper.get('a[href="https://example.com/guide"]');
    expect(descriptionLink.attributes("target")).toBe("_blank");
    expect(descriptionLink.classes()).toContain("plain-link");
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
    const createCall = vi.mocked(api).mock.calls.find(([path, options]) => path === "/paths" && options?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body)).textColor).toBeNull();
  });

  it("rejects a whitespace-only path name without creating a path", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    await wrapper.get('input[aria-label="New path name"]').setValue("   ");
    await wrapper.get("form.path-create-form").trigger("submit");

    expect(wrapper.get('[role="alert"]').text()).toBe("Enter a path name.");
    expect(
      vi.mocked(api).mock.calls.some(
        ([path, options]) => path === "/paths" && options?.method === "POST",
      ),
    ).toBe(false);
  });

  it("preserves a failed path create and lets the user retry", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    const name = wrapper.get('input[aria-label="New path name"]');
    await name.setValue("Reading");
    vi.mocked(api).mockRejectedValueOnce(new Error("network"));
    await wrapper.get("form.path-create-form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create path.");
    expect((name.element as HTMLInputElement).value).toBe("Reading");

    vi.mocked(api).mockResolvedValueOnce({
      id: "path-retry",
      name: "Reading",
      description: null,
      color: "#F8FAFC",
      status: "ACTIVE",
      pinned: false,
    });
    await wrapper.get("form.path-create-form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Reading");
    expect(
      vi.mocked(api).mock.calls.filter(
        ([path, options]) => path === "/paths" && options?.method === "POST",
      ),
    ).toHaveLength(2);
  });

  it("creates a path, shows it in the list, and reloads it from the API", async () => {
    const savedPaths = [
      { id: "path-1", name: "Algorithms", status: "ACTIVE", pinned: false },
    ];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths" && options?.method === "POST") {
        const created = {
          ...JSON.parse(String(options.body)),
          id: "path-2",
          status: "ACTIVE",
          pinned: false,
        };
        savedPaths.push(created);
        return created;
      }
      if (path === "/paths") return savedPaths;
      return undefined;
    });

    const first = mount(PathsView);
    await flushPromises();
    await first.get('button[aria-label="Add path"]').trigger("click");
    await first.get('input[aria-label="New path name"]').setValue("Reading");
    await first.get("form.path-create-form").trigger("submit");
    await flushPromises();
    expect(first.findAll(".path-title").map((title) => title.text())).toContain("Reading");
    first.unmount();

    setActivePinia(createPinia());
    const reloaded = mount(PathsView);
    await flushPromises();
    expect(reloaded.findAll(".path-title").map((title) => title.text())).toContain("Reading");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths", expect.objectContaining({ method: "POST" }));
    reloaded.unmount();
  });

  it("saves a custom path text color", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('button[aria-label="Add path"]').trigger("click");
    await wrapper.get('input[aria-label="New path name"]').setValue("Reading");
    await wrapper.get("#new-path-text-color-custom").setValue();
    await wrapper.get('input[aria-label="Custom path text color"]').setValue("#123456");
    await wrapper.get("form.path-create-form").trigger("submit");

    const createCall = vi.mocked(api).mock.calls.find(([path, options]) => path === "/paths" && options?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body)).textColor).toBe("#123456");
  });

  it("can return an edited path to automatic text contrast", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Algorithms", color: "#E8754E", textColor: "#102030", status: "ACTIVE" }];
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit")!.trigger("click");
    await wrapper.get("#edit-path-text-color-path-1-auto").setValue();
    await wrapper.get("form.path-edit").trigger("submit");

    const updateCall = vi.mocked(api).mock.calls.find(([path, options]) => path === "/paths/path-1" && options?.method === "PUT");
    expect(JSON.parse(String(updateCall?.[1]?.body)).textColor).toBeNull();
  });

  it("updates the visible pin state when pinning and unpinning a path", async () => {
    let pinned = false;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Algorithms", status: "ACTIVE", pinned }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/paths/path-1/pin") {
        pinned = JSON.parse(String(options?.body)).pinned;
        return { id: "path-1", name: "Algorithms", status: "ACTIVE", pinned };
      }
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    const pinButton = wrapper.get(".path-pin-button");
    expect(pinButton.attributes("aria-pressed")).toBe("false");
    expect(pinButton.attributes("aria-label")).toBe("Pin Algorithms");

    await pinButton.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1/pin",
      expect.objectContaining({ body: '{"pinned":true}' }),
    );
    expect(wrapper.get(".path-pin-button").attributes("aria-label")).toBe(
      "Unpin Algorithms",
    );
    expect(wrapper.get(".path-pin-button").attributes("aria-pressed")).toBe("true");

    await wrapper.get(".path-pin-button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1/pin",
      expect.objectContaining({ body: '{"pinned":false}' }),
    );
    expect(wrapper.get(".path-pin-button").attributes("aria-pressed")).toBe("false");
    expect(wrapper.get(".path-pin-button").attributes("aria-label")).toBe("Pin Algorithms");
    expect(wrapper.findAll(".path-order-button")).toHaveLength(0);
  });

  it("persists a reordered path list and renders the returned order", async () => {
    let orderedIds = ["path-1", "path-2"];
    const paths = [
      { id: "path-1", name: "Algorithms", status: "ACTIVE" },
      { id: "path-2", name: "Writing", status: "ACTIVE" },
    ];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths")
        return orderedIds.map((id) => paths.find((item) => item.id === id));
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/paths/order" && options?.method === "PUT") {
        orderedIds = JSON.parse(String(options.body)).pathIds;
        return undefined;
      }
      return undefined;
    });

    const wrapper = mount(PathsView);
    await flushPromises();
    const [firstPath, secondPath] = wrapper.findAll("article.path");
    await firstPath!.trigger("dragstart");
    await secondPath!.trigger("drop");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/order",
      expect.objectContaining({
        method: "PUT",
        body: '{"pathIds":["path-2","path-1"]}',
      }),
    );
    expect(wrapper.findAll(".path-title").map((title) => title.text())).toEqual([
      "Writing",
      "Algorithms",
    ]);

    wrapper.unmount();
    usePathsStore().reset();
    const reloaded = mount(PathsView);
    await flushPromises();
    expect(reloaded.findAll(".path-title").map((title) => title.text())).toEqual([
      "Writing",
      "Algorithms",
    ]);
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
    await wrapper.get(`#edit-path-text-color-path-1-custom`).setValue();
    await wrapper.get('input[aria-label="Custom path text color"]').setValue("#102030");
    await wrapper.get("form.path-edit").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Algorithms and Data Structures",
          description: "CS fundamentals",
          color: "#06B6D4",
          textColor: "#102030",
        }),
      }),
    );
  });

  it("preserves a failed path edit and lets the user retry", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    const name = wrapper.get('input[aria-label="Edit path name"]');
    await name.setValue("Algorithms revised");
    vi.mocked(api).mockRejectedValueOnce(new Error("network"));
    await wrapper.get("form.path-edit").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Could not update path.");
    expect((name.element as HTMLInputElement).value).toBe("Algorithms revised");

    vi.mocked(api).mockResolvedValueOnce({
      id: "path-1",
      name: "Algorithms revised",
      description: "Problem solving",
      color: "#E8754E",
      status: "ACTIVE",
      pinned: false,
    });
    await wrapper.get("form.path-edit").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Algorithms revised");
    expect(
      vi.mocked(api).mock.calls.filter(
        ([path, options]) => path === "/paths/path-1" && options?.method === "PUT",
      ),
    ).toHaveLength(2);
  });

  it("searches for a merge target, confirms the destructive merge, and refreshes paths", async () => {
    let listedPaths = [
      { id: "path-1", name: "Algorithms", status: "ACTIVE" },
      { id: "path-2", name: "Writing", description: "Drafting", status: "ACTIVE" },
    ];
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/paths") return listedPaths;
        if (path === "/paths/path-1/merge" && options?.method === "POST") {
          listedPaths = listedPaths.filter(({ id }) => id !== "path-1");
          return undefined;
        }
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
    expect(
      wrapper.findAll('input[name="merge-target-path"]').map((input) => input.element.value),
    ).toEqual(["path-2"]);
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
    expect(wrapper.findAll(".path-list .path")).toHaveLength(1);
    expect(wrapper.get(".path-list .path").text()).toContain("Writing");
    expect(wrapper.text()).not.toContain("Algorithms");
  });

  it("closes the merge chooser without changing paths", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/paths"
        ? [
            { id: "path-1", name: "Algorithms", status: "ACTIVE" },
            { id: "path-2", name: "Writing", status: "ACTIVE" },
          ]
        : path === "/labels?scope=TIME_ENTRY"
          ? []
        : undefined,
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
    await wrapper.get(".merge-path-dialog button.text-button").trigger("click");

    expect(wrapper.find(".merge-path-dialog").exists()).toBe(false);
    expect(wrapper.findAll(".path-list .path")).toHaveLength(2);
    expect(
      wrapper.get<HTMLInputElement>('[aria-label="Edit path name"]').element.value,
    ).toBe("Algorithms");
    expect(wrapper.findAll(".path-title").map((title) => title.text())).toContain("Writing");
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).includes("/merge")),
    ).toBe(false);

    await wrapper
      .findAll("form.path-edit button")
      .find((button) => button.text().trim() === "Merge")!
      .trigger("click");
    await wrapper.get('input[name="merge-target-path"]').setValue("path-2");
    await wrapper.get(".merge-path-dialog button.primary").trigger("click");
    expect(wrapper.get(".prompt-dialog").text()).toContain("Merge Algorithms into Writing?");
    await wrapper.get(".prompt-dialog button.text-button").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".path-list .path")).toHaveLength(2);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).includes("/merge")),
    ).toBe(false);
  });

  it("keeps both paths recoverable and permits retry after a failed merge", async () => {
    let listedPaths = [
      { id: "path-1", name: "Algorithms", status: "ACTIVE" },
      { id: "path-2", name: "Writing", status: "ACTIVE" },
    ];
    let mergeAttempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths") return listedPaths;
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/paths/path-1/merge" && options?.method === "POST") {
        mergeAttempts += 1;
        if (mergeAttempts === 1) throw new Error("temporary merge failure");
        listedPaths = listedPaths.filter(({ id }) => id !== "path-1");
        return undefined;
      }
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();

    const chooseMerge = async () => {
      let mergeButton = wrapper
        .findAll("form.path-edit button")
        .find((button) => button.text().trim() === "Merge");
      if (!mergeButton) {
        const source = wrapper
          .findAll(".path-list .path")
          .find((path) => path.text().includes("Algorithms"))!;
        await source
          .findAll("button.text-button")
          .find((button) => button.text().trim() === "Edit")!
          .trigger("click");
        mergeButton = wrapper
          .findAll("form.path-edit button")
          .find((button) => button.text().trim() === "Merge");
      }
      await mergeButton!.trigger("click");
      await wrapper.get('input[name="merge-target-path"]').setValue("path-2");
      await wrapper.get(".merge-path-dialog button.primary").trigger("click");
      await wrapper.get(".prompt-dialog button.primary").trigger("click");
      await flushPromises();
    };

    await chooseMerge();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not merge paths. Try again.");
    expect(wrapper.findAll(".path-list .path")).toHaveLength(2);
    expect(
      wrapper.get<HTMLInputElement>('[aria-label="Edit path name"]').element.value,
    ).toBe("Algorithms");
    expect(wrapper.findAll(".path-title").map((title) => title.text())).toContain("Writing");

    await chooseMerge();
    expect(mergeAttempts).toBe(2);
    expect(wrapper.findAll(".path-list .path")).toHaveLength(1);
    expect(wrapper.get(".path-title").text()).toBe("Writing");
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

  it("restores a removed path to the active list after undo", async () => {
    const path = {
      id: "path-1",
      name: "Algorithms",
      description: "Problem solving",
      color: "#E8754E",
      status: "ACTIVE",
      pinned: false,
      boardId: "board-1",
      boardHidden: false,
    };
    vi.mocked(api).mockImplementation(async (requestPath: string) => {
      if (requestPath === "/paths") return [path];
      if (requestPath === "/labels?scope=TIME_ENTRY") return [];
      if (requestPath === "/paths/path-1/summary")
        return {
          path,
          trackedSeconds: 3600,
          recentActivity: [
            {
              id: "restored-activity",
              timeEntryId: "restored-session",
              title: "Restored session",
              occurredAt: "2026-08-28T10:00:00Z",
            },
          ],
        };
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Remove")!
      .trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".path-title").map((title) => title.text())).toEqual([]);

    await wrapper.get(".undo-snackbar button").trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".path-title").map((title) => title.text())).toContain(
      "Algorithms",
    );
    expect(vi.mocked(api)).toHaveBeenCalledWith("/paths/path-1/restore", {
      method: "POST",
    });
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "Edit")!
      .trigger("click");
    expect(
      wrapper.get<HTMLInputElement>('input[role="switch"][name="boardVisible"]').element.checked,
    ).toBe(true);
    await wrapper
      .findAll("form.path-edit button")
      .find((button) => button.text().trim() === "Cancel")!
      .trigger("click");
    await wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "History")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get(".path-history-dialog").text()).toContain("Restored session");
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

  it("retries a failed path history load", async () => {
    let summaryAttempts = 0;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-retry", name: "Research", status: "ACTIVE" }];
      if (path === "/paths/path-retry/summary") {
        summaryAttempts += 1;
        if (summaryAttempts === 1) throw new Error("temporary failure");
        return {
          path: { id: "path-retry", name: "Research", status: "ACTIVE" },
          trackedSeconds: 60,
          recentActivity: [],
        };
      }
      return undefined;
    });
    const wrapper = mount(PathsView);
    await flushPromises();
    const historyButton = wrapper
      .findAll("button.text-button")
      .find((button) => button.text() === "History")!;

    await historyButton.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not load path history.");
    await historyButton.trigger("click");
    await flushPromises();
    expect(summaryAttempts).toBe(2);
    expect(wrapper.get(".path-history-dialog").text()).toContain("Research");
    expect(wrapper.get(".path-history-dialog").text()).toContain("No recent activity yet.");
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
