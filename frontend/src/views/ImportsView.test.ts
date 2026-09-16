import { flushPromises, mount } from "@vue/test-utils";
import ImportsView from "./ImportsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import { useReportsStore } from "../stores/reports";
import { useSessionsStore } from "../stores/sessions";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ImportsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/knowledge-base/batches") return [];
      if (path === "/imports/clockify/batches")
        return [
          {
            id: "batch-1",
            source: "IMPORT",
            imported: 2,
            skipped: 1,
            createdPaths: 1,
            createdAt: "2026-08-26T10:00:00Z",
            undoneAt: null,
          },
        ];
      if (path === "/imports/clockify")
        return { batchId: "batch-2", imported: 1, skipped: 0, createdPaths: 0 };
      if (path === "/imports/clockify/batches/batch-1")
        return { batchId: "batch-1", deletedEntries: 2, deletedActivities: 2 };
      return undefined;
    });
  });

  it("places the Knowledge Base tab before Clockify", () => {
    const wrapper = mount(ImportsView);

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Knowledge Base",
      "Clockify",
    ]);
    expect(
      wrapper.get("#imports-tab-knowledge-base").attributes("aria-selected"),
    ).toBe("true");
  });

  it("imports Clockify JSON and reloads the batch list", async () => {
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();

    await wrapper
      .get('textarea[aria-label="Clockify JSON"]')
      .setValue('{"timeentries":[]}');
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/imports/clockify",
      expect.objectContaining({ method: "POST", body: '{"timeentries":[]}' }),
    );
    expect(wrapper.text()).toContain("Imported 1 sessions");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/imports/clockify/batches");
  });

  it("invalidates cached sessions and reports after importing activity", async () => {
    const reports = useReportsStore();
    const sessions = useSessionsStore();
    reports.set("week", { totalSeconds: 60 });
    sessions.setPage("0:50", {
      sessions: [],
      page: 0,
      totalPages: 1,
      totalSessions: 0,
    });

    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="Clockify JSON"]')
      .setValue('{"timeentries":[]}');
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(reports.get("week")).toBeUndefined();
    expect(sessions.cachedPage("0:50")).toBeUndefined();
  });

  it("shows import batches with an undo action", async () => {
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("2 imported");
    await wrapper.get("button.text-button.danger").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/imports/clockify/batches/batch-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(wrapper.text()).toContain("Removed 2 imported sessions");
  });

  it("renders completed batches as already undone without an undo button", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/knowledge-base/batches") return [];
      if (path === "/imports/clockify/batches") {
        return [
          {
            id: "batch-done",
            source: "IMPORT",
            imported: 3,
            skipped: 0,
            createdPaths: 0,
            createdAt: "2026-08-26T10:00:00Z",
            undoneAt: "2026-08-26T11:00:00Z",
          },
        ];
      }
      return undefined;
    });
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("undone");
    expect(wrapper.find("button.text-button.danger").exists()).toBe(false);
  });

  it("paginates import history with five batches per page", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/knowledge-base/batches") return [];
      if (path === "/imports/clockify/batches") {
        return Array.from({ length: 6 }, (_, index) => ({
          id: `batch-${index}`,
          source: "IMPORT",
          imported: index + 1,
          skipped: 0,
          createdPaths: 0,
          createdAt: `2026-08-${String(26 - index).padStart(2, "0")}T10:00:00Z`,
          undoneAt: null,
        }));
      }
      return undefined;
    });
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".history-row")).toHaveLength(5);
    expect(wrapper.text()).toContain("Page 1 of 2");
    await wrapper
      .get('[aria-label="Import history pagination"] button:last-child')
      .trigger("click");
    expect(wrapper.findAll(".history-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("Page 2 of 2");
  });

  it("reports malformed and structurally invalid Clockify input", async () => {
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();
    const input = wrapper.get('textarea[aria-label="Clockify JSON"]');
    await input.setValue("not json");
    await wrapper.get("button.primary").trigger("click");
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Paste valid Clockify JSON.",
    );
    await input.setValue('{"entries":[]}');
    await wrapper.get("button.primary").trigger("click");
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Clockify JSON needs a timeentries array.",
    );
  });

  it("does not undo a batch when confirmation is declined", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const wrapper = mount(ImportsView);
    await flushPromises();
    await wrapper.get("#imports-tab-clockify").trigger("click");
    await flushPromises();
    await wrapper.get("button.text-button.danger").trigger("click");
    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      "/imports/clockify/batches/batch-1",
      expect.anything(),
    );
  });

  it("shows load and undo failures", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const loadFailure = mount(ImportsView);
    await flushPromises();
    expect(loadFailure.get('[role="alert"]').text()).toBe(
      "Unable to load import batches.",
    );

    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/clockify/batches")
        return [
          {
            id: "batch-1",
            source: "IMPORT",
            imported: 1,
            skipped: 0,
            createdPaths: 0,
            createdAt: "2026-08-26T10:00:00Z",
          },
        ];
      throw new Error("delete failed");
    });
    const undoFailure = mount(ImportsView);
    await flushPromises();
    await undoFailure.get("#imports-tab-clockify").trigger("click");
    await flushPromises();
    await undoFailure.get("button.text-button.danger").trigger("click");
    await flushPromises();
    expect(undoFailure.get('[role="alert"]').text()).toBe(
      "Could not undo this import batch.",
    );
  });

  it("keeps server diagnostics hidden behind an expandable disclosure", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/knowledge-base/batches") return [];
      throw Object.assign(
        new Error("Something went wrong. Please try again."),
        {
          details: '{"trace":"database details"}',
        },
      );
    });
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="Knowledge Base CSV"]')
      .setValue("entity,id,payload\n");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Could not import Knowledge Base data.",
    );
    expect(wrapper.get("details").attributes("open")).toBeUndefined();
    expect(wrapper.get("details").text()).toContain("database details");
  });
});
