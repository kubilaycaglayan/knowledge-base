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

  it("shows the empty Knowledge Base import history state", async () => {
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    try {
      await flushPromises();
      expect(wrapper.text()).toContain("No Knowledge Base imports yet.");
      expect(wrapper.findAll(".history-row")).toHaveLength(0);
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    } finally {
      wrapper.unmount();
    }
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

  it("imports Knowledge Base CSV text and reports the server outcome", async () => {
    const csv = 'entity,id,payload\npath,5e457350-f981-4f0a-a6cf-9a2e104ae1e5,"{}"\n';
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/imports/knowledge-base/batches")
        return [
          {
            id: "kb-batch-1",
            source: "KNOWLEDGE_BASE",
            imported: 2,
            skipped: 1,
            createdPaths: 1,
            createdAt: "2026-08-26T10:00:00Z",
            undoneAt: null,
          },
        ];
      if (path === "/imports/knowledge-base")
        return { batchId: "kb-batch-1", imported: 2, skipped: 1, createdPaths: 1 };
      return undefined;
    });
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();
    await wrapper.get('textarea[aria-label="Knowledge Base CSV"]').setValue(csv);
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/imports/knowledge-base",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      }),
    );
    expect(wrapper.get('[role="status"]').text()).toContain(
      "Imported 2 records, skipped 1 duplicates, and created 1 paths.",
    );
    expect(wrapper.text()).toContain("2 imported");
  });

  it("disables repeated Knowledge Base import submissions while a batch is pending", async () => {
    let finishImport!: (summary: { batchId: string; imported: number; skipped: number; createdPaths: number }) => void;
    const pendingImport = new Promise<{ batchId: string; imported: number; skipped: number; createdPaths: number }>((resolve) => {
      finishImport = resolve;
    });
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/imports/knowledge-base") return pendingImport;
      if (path === "/imports/knowledge-base/batches") return [];
      return undefined;
    });
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();
    await wrapper.get('textarea[aria-label="Knowledge Base CSV"]').setValue("CSV data");
    const submit = wrapper.get(".import-panel button.primary");
    await submit.trigger("click");
    await submit.trigger("click");

    expect(submit.attributes("disabled")).toBeDefined();
    expect(submit.text()).toBe("Importing…");
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/imports/knowledge-base")).toHaveLength(1);

    finishImport({ batchId: "batch-pending", imported: 1, skipped: 0, createdPaths: 0 });
    await flushPromises();
    await wrapper.unmount();
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

  it("keeps Knowledge Base batch history in stable order across pages", async () => {
    const batches = Array.from({ length: 6 }, (_, index) => ({
      id: `kb-batch-${index}`,
      source: "KNOWLEDGE_BASE",
      imported: index + 1,
      skipped: 0,
      createdPaths: 0,
      createdAt: `2026-08-${String(26 - index).padStart(2, "0")}T10:00:00Z`,
      undoneAt: null,
    }));
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/imports/knowledge-base/batches" ? batches : undefined,
    );
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();

    expect(wrapper.findAll(".history-row")).toHaveLength(5);
    expect(wrapper.findAll(".history-row").map((row) => row.text().match(/\d+ imported/)?.[0])).toEqual(
      ["1 imported", "2 imported", "3 imported", "4 imported", "5 imported"],
    );
    await wrapper.get('[aria-label="Import history pagination"] button:last-child').trigger("click");
    expect(wrapper.findAll(".history-row")).toHaveLength(1);
    expect(wrapper.get(".history-row").text()).toContain("6 imported");
    await wrapper.get('[aria-label="Import history pagination"] button:first-child').trigger("click");
    expect(wrapper.findAll(".history-row").map((row) => row.text().match(/\d+ imported/)?.[0])).toEqual(
      ["1 imported", "2 imported", "3 imported", "4 imported", "5 imported"],
    );
  });

  it("undoes only the selected Knowledge Base batch and refreshes its status", async () => {
    const batches = [
      { id: "kb-batch-1", source: "KNOWLEDGE_BASE", imported: 2, skipped: 1, createdPaths: 1, createdAt: "2026-08-26T10:00:00Z", undoneAt: null as string | null },
      { id: "kb-batch-2", source: "KNOWLEDGE_BASE", imported: 4, skipped: 0, createdPaths: 0, createdAt: "2026-08-25T10:00:00Z", undoneAt: null as string | null },
    ];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/imports/knowledge-base/batches") return batches;
      if (path === "/imports/knowledge-base/batches/kb-batch-1" && options?.method === "DELETE") {
        batches[0].undoneAt = "2026-08-27T10:00:00Z";
        return { deletedEntries: 2, deletedActivities: 2, deletedPaths: 1 };
      }
      return undefined;
    });
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();
    await wrapper.findAll("button.text-button.danger")[0].trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/imports/knowledge-base/batches/kb-batch-1",
      { method: "DELETE" },
    );
    expect(wrapper.findAll(".history-row")).toHaveLength(2);
    expect(wrapper.findAll(".history-row")[0].text()).toContain("undone");
    expect(wrapper.findAll(".history-row")[1].find("button").exists()).toBe(true);
    expect(wrapper.get('[role="status"]').text()).toContain("Removed 2 imported sessions");
  });

  it("keeps a Knowledge Base batch available after undo failure and retries it", async () => {
    const batches = [
      { id: "kb-batch-retry", source: "KNOWLEDGE_BASE", imported: 1, skipped: 0, createdPaths: 1, createdAt: "2026-08-26T10:00:00Z", undoneAt: null as string | null },
    ];
    let attempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/imports/knowledge-base/batches") return batches;
      if (path === "/imports/knowledge-base/batches/kb-batch-retry" && options?.method === "DELETE") {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        batches[0].undoneAt = "2026-08-27T10:00:00Z";
        return { deletedEntries: 1, deletedActivities: 0, deletedPaths: 1 };
      }
      return undefined;
    });
    const wrapper = mount(ImportsView, { props: { knowledgeBaseOnly: true } });
    await flushPromises();
    await wrapper.find("button.text-button.danger").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not undo this import batch.");
    expect(wrapper.findAll(".history-row")).toHaveLength(1);
    expect(wrapper.find("button.text-button.danger").exists()).toBe(true);

    await wrapper.find("button.text-button.danger").trigger("click");
    await flushPromises();
    expect(attempts).toBe(2);
    expect(wrapper.get(".history-row").text()).toContain("undone");
    expect(wrapper.get('[role="status"]').text()).toContain("Removed 1 imported sessions");
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
    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      "/imports/clockify",
      expect.objectContaining({ method: "POST" }),
    );
    await input.setValue('{"entries":[]}');
    await wrapper.get("button.primary").trigger("click");
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Clockify JSON needs a timeentries array.",
    );
    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      "/imports/clockify",
      expect.objectContaining({ method: "POST" }),
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
