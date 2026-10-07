import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import vuetify from "../plugins/vuetify";
import { createMemoryHistory, createRouter } from "vue-router";
import NotesView from "./NotesView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../components/NotesPageSizeSelect.vue", () => ({
  default: {
    props: { modelValue: Number, items: Array },
    emits: ["update:modelValue"],
    template: `<select
      name="notes-per-page"
      aria-label="Notes per page"
      :value="modelValue"
      @change="$emit('update:modelValue', Number($event.target.value))"
    ><option v-for="item in items" :key="item" :value="item">{{ item }}</option></select>`,
  },
}));

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
function mountNotes(r: ReturnType<typeof router>) {
  return mount(NotesView, {
    global: { plugins: [r, vuetify] },
  });
}
async function openNoteLabels(wrapper: ReturnType<typeof mount>) {
  await wrapper.get(".picker-chevron").trigger("click");
  await flushPromises();
  return new DOMWrapper(document.querySelector<HTMLInputElement>(
    '.label-picker-menu input[aria-label="Note labels"]',
  )!);
}
function noteLabelOption(name: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
    .find((option) => option.textContent?.includes(name));
}

describe("NotesView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => document.querySelectorAll(".label-picker-menu").forEach((menu) => menu.remove()));
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
    const wrapper = mountNotes(r);
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

  it("starts note tags at the beginning of the metadata line", async () => {
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();

    expect(getComputedStyle(wrapper.get(".note-tags").element).justifyContent).toBe(
      "flex-start",
    );
  });

  it("opens the note editor when the card body is clicked", async () => {
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
    await flushPromises();
    const title = wrapper.get('input[aria-label="Note title"]');
    await title.setValue("Updated");
    expect(wrapper.get('[aria-label="Note content"]').text()).toBe(
      "Graph theory",
    );
    expect(wrapper.get(".rich-editor").classes()).toContain("rich-text");
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

  it("keeps the clicked note open when an earlier note loads late", async () => {
    const second = {
      ...note,
      id: "note-2",
      title: "Writing",
      content: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Essays" }] },
        ],
      }),
    };
    let releaseFirst: () => void = () => {};
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/notes?")) return page([note, second]);
      if (path === "/notes/note-1")
        return new Promise((resolve) => {
          releaseFirst = () => resolve(note);
        });
      if (path === "/notes/note-2") return second;
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();

    await wrapper.findAll(".note-card-link")[0].trigger("click");
    await flushPromises();
    await r.push("/notes");
    await flushPromises();
    await wrapper.findAll(".note-card-link")[1].trigger("click");
    await flushPromises();
    releaseFirst();
    await flushPromises();

    expect(r.currentRoute.value.params.id).toBe("note-2");
    expect(
      (wrapper.get('input[aria-label="Note title"]').element as HTMLInputElement)
        .value,
    ).toBe("Writing");
    expect(wrapper.get('[aria-label="Note content"]').text()).toBe("Essays");
  });

  it("saves edits to the open note when an earlier note's save finishes late", async () => {
    const second = { ...note, id: "note-2", title: "Writing" };
    let releaseFirstSave: () => void = () => {};
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path.startsWith("/notes?")) return page([note, second]);
        if (path === "/notes/note-1" && options?.method === "PUT")
          return new Promise((resolve) => {
            releaseFirstSave = () => resolve({ ...note, title: "Learning 2" });
          });
        if (path === "/notes/note-1") return note;
        if (path === "/notes/note-2" && options?.method === "PUT")
          return { ...second, title: "Writing 2", version: 1 };
        if (path === "/notes/note-2") return second;
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Learning 2");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    await r.push("/notes");
    await flushPromises();
    await r.push("/notes/note-2");
    await flushPromises();
    releaseFirstSave();
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Writing 2");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    const puts = vi
      .mocked(api)
      .mock.calls.filter(([, options]) => options?.method === "PUT");
    expect(puts.map(([path]) => path)).toEqual([
      "/notes/note-1",
      "/notes/note-2",
    ]);
    expect(String(puts[1][1]?.body)).toContain('"title":"Writing 2"');
  });

  // RT-01
  it("puts the formatting toolbar under the note body", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => (path === "/notes/note-1" && !options ? note : undefined));
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const host = wrapper.get(".rich-editor");
    const toolbar = host.find('[role="toolbar"][aria-label="Formatting"]');
    expect(toolbar.exists()).toBe(true);
    expect(host.element.lastElementChild).toBe(toolbar.element.closest(".rich-text-toolbar"));
    expect(toolbar.find('button[aria-label="Bold"]').exists()).toBe(true);
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
    const wrapper = mountNotes(r);
    await flushPromises();
    const input = await openNoteLabels(wrapper);
    await input.setValue("e");
    const optionNames = [...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
      .map((button) => button.querySelector(".option-name")?.textContent);
    expect(optionNames).toContain("Work notes");
    expect(optionNames).toContain("Travel");
    noteLabelOption("Travel")?.click();
    await flushPromises();
    expect(wrapper.get(".tag-editor .measure-row").text()).toContain("Travel");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
  });

  it("adds a new label from the note label picker", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/labels") return [{ id: "study", name: "Study" }];
        if (path === "/labels" && options?.method === "POST")
          return { id: "mobile", name: "mobile", color: null, scopes: ["NOTE"] };
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, tags: ["study", "mobile"] };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const input = await openNoteLabels(wrapper);
    await input.setValue("mobile");
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels", expect.objectContaining({ method: "POST" }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
  });

  it("creates a note label with Enter in the picker", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && !options) return note;
        if (path === "/notes/labels") return [];
        if (path === "/labels" && options?.method === "POST")
          return { id: "mobile", name: "mobile", color: null, scopes: ["NOTE"] };
        if (path === "/notes/note-1" && options?.method === "PUT")
          return { ...note, tags: ["study", "mobile"] };
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const input = await openNoteLabels(wrapper);
    await input.setValue("mobile");
    expect(noteLabelOption("Create")).toBeDefined();
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(vi.mocked(api)).toHaveBeenCalledWith("/labels", expect.objectContaining({ method: "POST" }));
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
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
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get(".notes-pagination-summary button").trigger("click");
    await flushPromises();
    await wrapper.get(".note-row button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1/restore", {
      method: "POST",
    });
  });
});
