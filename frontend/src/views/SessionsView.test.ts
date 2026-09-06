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
            startedAt: "2026-08-27T11:00:00Z",
            endedAt: "2026-08-28T12:00:00Z",
            durationSeconds: 3600,
            description: "Most recent",
            source: "WEB",
            pathId: "path-1",
            itemId: "item-1",
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
        return [{ id: "path-1", name: "Learning", description: "A path", status: "ACTIVE" }];
      if (path === "/items")
        return [{ id: "item-1", title: "Vue", description: "Nested item", status: "ACTIVE", progress: 40, pathIds: ["path-1"] }];
      return undefined;
    });
  });

  it("lists sessions by latest completion time and shows nested path and item properties", async () => {
    const wrapper = mount(SessionsView);
    await flushPromises();
    expect(wrapper.findAll("article.session-card")[0].text()).toContain("Most recent");
    expect(wrapper.text()).toContain("Path: Learning · A path");
    expect(wrapper.text()).toContain("Item: Vue · ACTIVE · 40%");
  });

  it("renders multiple session items and marks deleted references clearly", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/time-entries?")) return {
        page: 0,
        totalPages: 1,
        totalSessions: 1,
        sessions: [{ id: "multi", startedAt: "2026-08-27T11:00:00Z", endedAt: "2026-08-27T12:00:00Z", durationSeconds: 3600, source: "WEB", itemIds: ["item-1", "removed-item"] }],
      };
      if (path === "/paths") return [];
      if (path === "/items") return [{ id: "item-1", title: "Vue", status: "ACTIVE", progress: 40 }];
      return undefined;
    });
    const wrapper = mount(SessionsView);
    await flushPromises();

    expect(wrapper.get(".session-summary").text()).toContain("Vue · ACTIVE · 40%, Removed item");
    await wrapper.get("button.text-button").trigger("click");
    expect((wrapper.get('select[aria-label="Edit session item"]').element as HTMLSelectElement).selectedOptions[0]?.value).toBe("item-1");
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
      if (path === "/paths" || path === "/items") return [];
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
      if (path === "/paths" || path === "/items") return [];
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
      if (path === "/paths" || path === "/items") return [];
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
