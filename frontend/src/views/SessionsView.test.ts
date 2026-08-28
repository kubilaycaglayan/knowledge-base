import { flushPromises, mount } from "@vue/test-utils";
import SessionsView from "./SessionsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("SessionsView", () => {
  beforeEach(() => {
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
            startedAt: "2026-08-28T11:00:00Z",
            endedAt: "2026-08-28T12:00:00Z",
            durationSeconds: 3600,
            description: "Most recent",
            source: "WEB",
            pathId: "path-1",
            itemId: "item-1",
          },
          {
            id: "old",
            startedAt: "2026-08-27T11:00:00Z",
            endedAt: "2026-08-27T12:00:00Z",
            durationSeconds: 3600,
            description: "Older",
            source: "MANUAL",
          },
          ],
        };
      if (path === "/paths")
        return [{ id: "path-1", name: "Learning", description: "A path", status: "ACTIVE" }];
      if (path === "/items")
        return [{ id: "item-1", title: "Vue", description: "Nested item", status: "ACTIVE", progress: 40, pathIds: ["path-1"] }];
      return undefined;
    });
  });

  it("lists sessions newest first and shows nested path and item properties", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    expect(wrapper.findAll("article.session-card")[0].text()).toContain("Most recent");
    expect(wrapper.text()).toContain("Path: Learning · A path");
    expect(wrapper.text()).toContain("Item: Vue · ACTIVE · 40%");
  });

  it("updates every editable session property", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get('[aria-label="Edit session description"]').setValue("Updated");
    await wrapper.get('[aria-label="Edit session source"]').setValue("IOS");
    await wrapper.get('[aria-label="Edit session path"]').setValue("path-1");
    await wrapper.get('[aria-label="Edit session item"]').setValue("item-1");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries/new", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"source":"IOS"'),
    }));
  });
});
