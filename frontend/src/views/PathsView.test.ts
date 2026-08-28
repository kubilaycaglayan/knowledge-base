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
      if (path === "/items")
        return [
          { id: "item-1", title: "Graph theory" },
          { id: "item-2", title: "Sorting" },
        ];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          itemIds: ["item-1", "item-2"],
          itemProgress: { "item-1": 40, "item-2": 80 },
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

  it("filters associated path items while preserving their progress", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await flushPromises();

    expect(wrapper.find("article.path.expanded .path-summary").exists()).toBe(
      true,
    );
    expect(wrapper.find("article.path.expanded").text()).toContain(
      "PATH HISTORY",
    );
    expect(wrapper.text()).toContain("Graph theory");
    expect(wrapper.text()).toContain("Sorting");
    expect(wrapper.text()).toContain(
      "2026-07-31T09:51:19Z – 2026-07-31T12:01:39Z",
    );
    await wrapper.get('input[aria-label="Filter path items"]').setValue("sort");

    expect(wrapper.text()).not.toContain("Graph theory — 40%");
    expect(wrapper.text()).toContain("Sorting — 80%");
  });

  it("toggles path history closed when History is clicked again", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    const historyButton = wrapper.get("button.text-button");

    await historyButton.trigger("click");
    await flushPromises();
    expect(wrapper.find(".path-summary").exists()).toBe(true);
    expect(historyButton.attributes("aria-expanded")).toBe("true");

    await historyButton.trigger("click");
    expect(wrapper.find(".path-summary").exists()).toBe(false);
    expect(historyButton.attributes("aria-expanded")).toBe("false");
  });

  it("keeps each path history open independently", async () => {
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
      if (path === "/items") return [];
      if (path === "/paths/path-1/summary")
        return {
          path: { id: "path-1", name: "Algorithms", status: "ACTIVE" },
          itemIds: [],
          itemProgress: {},
          trackedSeconds: 120,
          recentActivity: [],
        };
      if (path === "/paths/path-2/summary")
        return {
          path: { id: "path-2", name: "Writing", status: "ACTIVE" },
          itemIds: [],
          itemProgress: {},
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
    await historyButtons[1].trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".path-summary")).toHaveLength(2);
    expect(
      wrapper.findAll("button[aria-expanded='true']"),
    ).toHaveLength(2);
  });

  it("submits a selected path color from the twelve-color picker", async () => {
    const wrapper = mount(PathsView);
    await flushPromises();
    await wrapper.get('input[aria-label="New path name"]').setValue("Reading");
    await wrapper
      .get('button[aria-label="Choose path color #4C6FFF"]')
      .trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"color":"#4C6FFF"'),
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
      .get('button[aria-label="Set edit path color #2188FF"]')
      .trigger("click");
    await wrapper.get("form.path-edit").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/paths/path-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Algorithms and Data Structures",
          description: "CS fundamentals",
          color: "#2188FF",
        }),
      }),
    );
  });
});
