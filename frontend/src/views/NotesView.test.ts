import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import NotesView from "./NotesView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const note = {
  id: "note-1",
  title: "Learning",
  content: JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Graph theory" }] },
    ],
  }),
  contentText: "Graph theory",
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
  version: 0,
  tags: ["study"],
  pinned: false,
  deletedAt: undefined as string | undefined,
};
function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/notes", name: "notes", component: NotesView },
      { path: "/notes/:id", name: "note-editor", component: NotesView },
    ],
  });
}
function page(items = [note]) {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: 1 };
}

describe("NotesView", () => {
  beforeEach(() => setActivePinia(createPinia()));
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
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Learning");
    expect(wrapper.get(".note-row").text()).toContain("Graph theory");
    expect(wrapper.text()).toContain("study");
    await wrapper.get('input[aria-label="Search notes"]').setValue("graph");
    await new Promise((resolve) => setTimeout(resolve, 280));
    await flushPromises();
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).includes("q=graph")),
    ).toBe(true);
  });

  it("opens the note editor when the card body is clicked", async () => {
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();

    await wrapper.get(".note-card-link").trigger("click");
    await flushPromises();

    expect(r.currentRoute.value.name).toBe("note-editor");
    expect(r.currentRoute.value.params.id).toBe("note-1");
  });

  it("pins notes and persists card ordering", async () => {
    const second = { ...note, id: "note-2", title: "Writing" };
    let pinned = false;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/notes?") || path === "/notes")
        return page(pinned ? [{ ...note, pinned: true }, second] : [note, second]);
      if (path === "/notes/note-1/pin")
        return { ...note, pinned: (pinned = true) };
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get(".note-pin-button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes/note-1/pin",
      expect.objectContaining({ body: '{"pinned":true}' }),
    );
    expect(wrapper.get(".note-pin-button").attributes("aria-label")).toBe(
      "Unpin Learning",
    );
    await wrapper.findAll(".note-row")[0].trigger("dragstart");
    await wrapper.findAll(".note-row")[1].trigger("drop");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes/order",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("reuses the cached notes page when returning to the list", async () => {
    const firstRouter = router();
    await firstRouter.push("/notes");
    await firstRouter.isReady();
    const first = mount(NotesView, { global: { plugins: [firstRouter] } });
    await flushPromises();
    const initialListCalls = vi
      .mocked(api)
      .mock.calls.filter(([path]) => String(path).startsWith("/notes?")).length;
    first.unmount();

    const secondRouter = router();
    await secondRouter.push("/notes");
    await secondRouter.isReady();
    const second = mount(NotesView, { global: { plugins: [secondRouter] } });
    await flushPromises();

    expect(
      vi
        .mocked(api)
        .mock.calls.filter(([path]) => String(path).startsWith("/notes?"))
        .length,
    ).toBe(initialListCalls);
    expect(second.get(".note-row").text()).toContain("Learning");
  });

  it("searches notes by label", async () => {
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get('input[aria-label="Search notes"]').setValue("study");
    await new Promise((resolve) => setTimeout(resolve, 280));
    await flushPromises();
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).includes("q=study")),
    ).toBe(true);
  });

  it("creates a note from the icon action and opens the editor", async () => {
    const created = { ...note, id: "new-note", title: "" };
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes" && options?.method === "POST") return created;
        if (path.startsWith("/notes?")) return page();
        if (path === "/notes/new-note") return created;
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get('button[aria-label="Create new note"]').trigger("click");
    await flushPromises();
    expect(r.currentRoute.value.name).toBe("note-editor");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads the editor and autosaves title and rich content without a save button", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, title: "Updated" };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    const title = wrapper.get('input[aria-label="Note title"]');
    await title.setValue("Updated");
    expect(wrapper.get('[aria-label="Note content"]').text()).toBe(
      "Graph theory",
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes/note-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"title":"Updated"'),
      }),
    );
    expect(wrapper.find('button[aria-label="Save"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Undo"]').exists()).toBe(true);
  });

  it("suggests matching existing labels while typing and applies a selected label", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/labels")
          return [
            { id: "study", name: "Study" },
            { id: "work", name: "Work notes" },
            { id: "travel", name: "Travel" },
          ];
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, tags: ["study", "Work notes"] };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    const input = wrapper.get('input[aria-label="Add label"]');
    await input.setValue("e");
    expect(
      wrapper.findAll(".label-suggestion").map((button) => button.text()),
    ).toEqual(["Work notes", "Travel"]);
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.findAll(".label-suggestion")[1].classes()).toContain(
      "active",
    );
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.findAll(".note-tag").map((tag) => tag.text())).toEqual([
      "study×",
      "Travel×",
    ]);
    expect((input.element as HTMLInputElement).value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
  });

  it("adds a new label when Enter is pressed on the mobile keyboard", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/labels") return [{ id: "study", name: "Study" }];
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, tags: ["study", "mobile"] };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    const input = wrapper.get('input[aria-label="Add label"]');
    await input.setValue("mobile");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.findAll(".note-tag").map((tag) => tag.text())).toEqual([
      "study×",
      "mobile×",
    ]);
    expect((input.element as HTMLInputElement).value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
  });

  it("adds a new label when a mobile keyboard emits a line-break input", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/labels") return [];
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, tags: ["study", "mobile"] };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    const input = wrapper.get('input[aria-label="Add label"]');
    await input.setValue("mobile");
    await input.trigger("beforeinput", { inputType: "insertLineBreak" });

    expect(wrapper.findAll(".note-tag").map((tag) => tag.text())).toEqual([
      "study×",
      "mobile×",
    ]);
    expect((input.element as HTMLInputElement).value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
  });

  it("replays a draft when another window saved first", async () => {
    let writes = 0;
    const latest = { ...note, version: 1, title: "Remote title" };
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && options?.method === "PUT") {
          writes += 1;
          if (writes === 1) throw new Error("Note changed in another window");
          return { ...latest, title: "Updated", version: 2 };
        }
        if (path === "/notes/note-1") return writes ? latest : note;
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Updated");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    expect(writes).toBe(2);
    expect(vi.mocked(api).mock.calls.at(-1)?.[1]?.body).toContain(
      '"version":1',
    );
    expect(wrapper.get(".save-state").text()).toBe("Saved");
  });

  it("turns JSON note content into a readable list excerpt", async () => {
    const rich = { ...note, contentText: note.content };
    vi.mocked(api).mockImplementation(async (path: string) =>
      path.startsWith("/notes?") ? page([rich]) : undefined,
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Graph theory");
    expect(wrapper.get(".note-row").text()).not.toContain('"type":"doc"');
  });

  it("renders an empty rich-text body as italic Empty note", async () => {
    const empty = {
      ...note,
      contentText: note.content.replace(
        /\{\"type\":\"text\",\"text\":\"Graph theory\"\}/,
        "",
      ),
    };
    vi.mocked(api).mockImplementation(async (path: string) =>
      path.startsWith("/notes?") ? page([empty]) : undefined,
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    expect(wrapper.get(".note-row em").text()).toBe("Empty note");
  });

  it("archives a note after confirmation", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && options?.method === "DELETE")
          return undefined;
        if (path.startsWith("/notes?")) return page();
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get(".note-row button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1", {
      method: "DELETE",
    });
    vi.unstubAllGlobals();
  });

  it("restores a note from the archive", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1/restore" && options?.method === "POST")
          return undefined;
        if (path.includes("archived=true"))
          return page([{ ...note, deletedAt: "2026-09-03T10:00:00Z" }]);
        if (path.startsWith("/notes?")) return page();
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mount(NotesView, { global: { plugins: [r] } });
    await flushPromises();
    await wrapper.get(".notes-toolbar button").trigger("click");
    await flushPromises();
    await wrapper.get(".note-row button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1/restore", {
      method: "POST",
    });
  });
});
