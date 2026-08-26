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
});
