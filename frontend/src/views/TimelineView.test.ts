import { flushPromises, mount } from "@vue/test-utils";
import TimelineView from "./TimelineView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("TimelineView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/items") return [];
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

  it("saves a note attached to an activity", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/items") return [];
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

    const addNoteButton = wrapper
      .findAll("button.text-button")
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
          activityId: "activity-1",
          title: "Key idea",
          content: "Spaced repetition helps.",
        }),
      }),
    );
  });

  it("supports the thirty-day and clear date presets", async () => {
    const wrapper = mount(TimelineView);
    await flushPromises();

    await wrapper.findAll("button.text-button").find((button) => button.text().includes("30 days"))!.trigger("click");
    await flushPromises();
    const thirtyDayRequest = vi.mocked(api).mock.calls.at(-1)?.[0] as string;
    expect(thirtyDayRequest).toContain("from=");
    expect(thirtyDayRequest).toContain("to=");

    await wrapper.findAll("button.text-button").find((button) => button.text().includes("All time"))!.trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe("/activities?");
  });

  it("attaches a note to the time entry when an activity provides one", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/items") return [];
      if (path.startsWith("/activities?")) return [{ id: "activity-1", type: "TIMER_STOPPED", title: "Focus", occurredAt: "2026-08-25T12:00:00Z", timeEntryId: "entry-1" }];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Add note")!.trigger("click");
    await wrapper.get('input[aria-label="Activity note title"]').setValue("Timer insight");
    await wrapper.get('textarea[aria-label="Activity note content"]').setValue("Keep this block focused.");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ timeEntryId: "entry-1", title: "Timer insight", content: "Keep this block focused." }),
    }));
  });

  it("submits activity, path, item, and date filters together", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [{ id: "path-1", name: "Learning" }];
      if (path === "/items") return [{ id: "item-1", title: "Algorithms" }];
      if (path.startsWith("/activities?")) return [];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper.get('select[aria-label="Activity type"]').setValue("TIMER_STOPPED");
    await wrapper.get('select[aria-label="Path"]').setValue("path-1");
    await wrapper.get('select[aria-label="Item"]').setValue("item-1");
    await wrapper.get('input[aria-label="From date"]').setValue("2026-08-01");
    await wrapper.get('input[aria-label="To date"]').setValue("2026-08-31");
    await wrapper.get("form.filters").trigger("submit");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/activities?type=TIMER_STOPPED&pathId=path-1&itemId=item-1&from=2026-08-01T00%3A00%3A00Z&to=2026-08-31T23%3A59%3A59Z");
  });

  it("reports initial-load and note-save failures and ignores incomplete notes", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("paths failed"));
    const failedLoad = mount(TimelineView);
    await flushPromises();
    expect(failedLoad.get('[role="alert"]').text()).toBe("Unable to load activity.");

    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/paths" || path === "/items") return [];
      if (path.startsWith("/activities?")) return [{ id: "activity-1", type: "NOTE_CREATED", title: "Read chapter", occurredAt: "2026-08-25T12:00:00Z" }];
      if (path === "/notes" && options?.method === "POST") throw new Error("note failed");
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Add note")!.trigger("click");
    await wrapper.get('input[aria-label="Activity note title"]').setValue(" ");
    await wrapper.get('textarea[aria-label="Activity note content"]').setValue(" ");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/notes" && options?.method === "POST")).toBe(false);

    await wrapper.get('input[aria-label="Activity note title"]').setValue("Insight");
    await wrapper.get('textarea[aria-label="Activity note content"]').setValue("Content");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not save activity note.");
  });

  it("closes an activity note editor without saving", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/items") return [];
      if (path.startsWith("/activities?")) return [{ id: "activity-1", type: "NOTE_CREATED", title: "Read chapter", occurredAt: "2026-08-25T12:00:00Z" }];
      return undefined;
    });
    const wrapper = mount(TimelineView);
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Add note")!.trigger("click");
    expect(wrapper.find('input[aria-label="Activity note title"]').exists()).toBe(true);
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Cancel")!.trigger("click");
    expect(wrapper.find('input[aria-label="Activity note title"]').exists()).toBe(false);
  });
});
