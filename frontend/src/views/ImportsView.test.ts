import { flushPromises, mount } from "@vue/test-utils";
import ImportsView from "./ImportsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ImportsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(api).mockImplementation(async (path: string) => {
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

  it("imports Clockify JSON and reloads the batch list", async () => {
    const wrapper = mount(ImportsView);
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

  it("shows import batches with an undo action", async () => {
    const wrapper = mount(ImportsView);
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
});
