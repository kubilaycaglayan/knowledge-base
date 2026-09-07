import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import NotesView from "./NotesView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const note = {
  id: "note-1", title: "Learning", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Graph theory" }] }] }),
  contentText: "Graph theory", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z", version: 0, tags: ["study"],
};
function router() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/notes", name: "notes", component: NotesView },
    { path: "/notes/:id", name: "note-editor", component: NotesView },
  ] });
}
function page(items = [note]) { return { items, page: 0, size: 20, totalItems: items.length, totalPages: 1 }; }

describe("NotesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/notes?") || path === "/notes") return page();
      if (path === "/notes/note-1") return note;
      if (path === "/notes" && false) return note;
      return undefined;
    });
  });

  it("lists notes with searchable excerpts, labels, and pagination controls", async () => {
    const r = router(); await r.push("/notes"); await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } }); await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Learning");
    expect(wrapper.get(".note-row").text()).toContain("Graph theory");
    expect(wrapper.text()).toContain("study");
    await wrapper.get('input[aria-label="Search notes"]').setValue("graph");
    await new Promise(resolve => setTimeout(resolve, 280)); await flushPromises();
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("q=graph"))).toBe(true);
  });

  it("creates a note from the icon action and opens the editor", async () => {
    const created = { ...note, id: "new-note", title: "Untitled note" };
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes" && options?.method === "POST") return created;
      if (path.startsWith("/notes?")) return page();
      if (path === "/notes/new-note") return created;
      return undefined;
    });
    const r = router(); await r.push("/notes"); await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } }); await flushPromises();
    await wrapper.get('button[aria-label="Create new note"]').trigger("click"); await flushPromises();
    expect(r.currentRoute.value.name).toBe("note-editor");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes", expect.objectContaining({ method: "POST" }));
  });

  it("loads the editor and autosaves title and rich content without a save button", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && !options) return note;
      if (path === "/notes/note-1" && options?.method === "PUT") return { ...note, title: "Updated" };
      return undefined;
    });
    const r = router(); await r.push("/notes/note-1"); await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } }); await flushPromises();
    const title = wrapper.get('input[aria-label="Note title"]'); await title.setValue("Updated");
    await new Promise(resolve => setTimeout(resolve, 700)); await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"title":"Updated"') }));
    expect(wrapper.find('button[aria-label="Save"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Undo"]').exists()).toBe(true);
  });
});
