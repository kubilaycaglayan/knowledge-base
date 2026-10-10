import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import vuetify from "../plugins/vuetify";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import NotesView from "./NotesView.vue";
import { EditorContent } from "@tiptap/vue-3";
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
  return mount(
    { components: { RouterView }, template: "<RouterView />" },
    {
      global: { plugins: [r, vuetify] },
    },
  );
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

  it("shows an actionable empty state when no notes exist", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/notes" || path.startsWith("/notes?")) return page([]);
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    try {
      await flushPromises();
      expect(wrapper.get(".notes-empty").text()).toBe("Your notes will appear here.");
      expect(wrapper.findAll(".note-row")).toHaveLength(0);
      expect(wrapper.get('button[aria-label="Create new note"]').exists()).toBe(true);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
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

  it("returns from the note editor to the filtered list and clears its selected URL", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/notes?")) return page();
      if (path === "/notes/note-1" && options?.method === "PUT") return note;
      if (path === "/notes/note-1") return note;
      return undefined;
    });
    const r = router();
    await r.push("/notes?q=graph");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get(".note-card-link").trigger("click");
    await flushPromises();
    expect(r.currentRoute.value.path).toBe("/notes/note-1");

    await wrapper.get('button[aria-label="Back to notes"]').trigger("click");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.currentRoute.value.path).toBe("/notes");
    expect(r.currentRoute.value.query.q).toBe("graph");
    expect(wrapper.find(".note-editor").exists()).toBe(false);
  });

  it("pins notes and persists card ordering", async () => {
    const second = { ...note, id: "note-2", title: "Writing" };
    let pinned = false;
    let orderedNotes = [note, second];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/notes?") || path === "/notes")
        return page(pinned ? orderedNotes.map((item) => item.id === note.id ? { ...item, pinned: true } : item) : orderedNotes);
      if (path === "/notes/note-1/pin")
        return { ...note, pinned: (pinned = true) };
      if (path === "/notes/order" && options?.method === "PUT") {
        const ids = JSON.parse(String(options.body)).noteIds;
        orderedNotes = ids.map((id: string) => [note, second].find((item) => item.id === id)!);
        return undefined;
      }
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
    expect(wrapper.findAll(".note-row strong").map((title) => title.text())).toEqual(["Writing", "Learning"]);
    wrapper.unmount();

    const reopenedRouter = router();
    await reopenedRouter.push("/notes");
    await reopenedRouter.isReady();
    const reopened = mountNotes(reopenedRouter);
    await flushPromises();
    expect(reopened.findAll(".note-row strong").map((title) => title.text())).toEqual(["Writing", "Learning"]);
    reopened.unmount();
  });

  it("keeps note order after a failed reorder and allows a retry", async () => {
    const second = { ...note, id: "note-2", title: "Writing" };
    let orderedNotes = [note, second];
    let attempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/notes?")) return page(orderedNotes);
      if (path === "/notes/order" && options?.method === "PUT") {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        const ids = JSON.parse(String(options.body)).noteIds;
        orderedNotes = ids.map((id: string) => [note, second].find((item) => item.id === id)!);
      }
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const dragFirstOntoSecond = async () => {
      await wrapper.findAll(".note-row")[0].trigger("dragstart");
      await wrapper.findAll(".note-row")[1].trigger("drop");
      await flushPromises();
    };

    await dragFirstOntoSecond();
    expect(wrapper.findAll(".note-row strong").map((title) => title.text())).toEqual(["Learning", "Writing"]);
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not reorder notes.");
    await dragFirstOntoSecond();
    expect(attempts).toBe(2);
    expect(wrapper.findAll(".note-row strong").map((title) => title.text())).toEqual(["Writing", "Learning"]);
    wrapper.unmount();
  });

  it("reorders notes with accessible move controls", async () => {
    const second = { ...note, id: "note-2", title: "Writing" };
    let orderedNotes = [note, second];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/notes?")) return page(orderedNotes);
      if (path === "/notes/order" && options?.method === "PUT") {
        const ids = JSON.parse(String(options.body)).noteIds;
        orderedNotes = ids.map((id: string) => [note, second].find((item) => item.id === id)!);
      }
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();

    const moveDown = wrapper.get('button[aria-label="Move Learning down"]');
    expect(moveDown.element.tagName).toBe("BUTTON");
    await moveDown.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes/order",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ noteIds: ["note-2", "note-1"] }),
      }),
    );
    expect(wrapper.findAll(".note-row strong").map((title) => title.text())).toEqual(["Writing", "Learning"]);
    wrapper.unmount();
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

  it("filters note text, restores the query in the URL, and distinguishes empty from error", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/notes?")) {
        const params = new URLSearchParams(path.split("?")[1]);
        if (params.get("q") === "offline") throw new Error("offline");
        return params.get("q") === "graph" ? page([note]) : page([]);
      }
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();

    const search = wrapper.get<HTMLInputElement>('input[aria-label="Search notes"]');
    await search.setValue("graph");
    await new Promise((resolve) => setTimeout(resolve, 280));
    await flushPromises();
    expect(wrapper.findAll(".note-row")).toHaveLength(1);
    expect(r.currentRoute.value.query.q).toBe("graph");

    await search.setValue("missing");
    await new Promise((resolve) => setTimeout(resolve, 280));
    await flushPromises();
    expect(wrapper.get(".notes-empty").text()).toBe("No notes match your search.");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await search.setValue("offline");
    await new Promise((resolve) => setTimeout(resolve, 280));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to load notes.");
    await wrapper.unmount();

    const reloadedRouter = router();
    await reloadedRouter.push("/notes?q=graph");
    await reloadedRouter.isReady();
    const reloaded = mountNotes(reloadedRouter);
    await flushPromises();
    expect(
      (reloaded.get('input[aria-label="Search notes"]').element as HTMLInputElement).value,
    ).toBe("graph");
    expect(reloaded.findAll(".note-row")).toHaveLength(1);
    await reloadedRouter.push("/notes");
    await reloadedRouter.back();
    await flushPromises();
    expect(
      (reloaded.get('input[aria-label="Search notes"]').element as HTMLInputElement).value,
    ).toBe("graph");
    await reloaded.unmount();
  });

  it("keeps the visible notes when a focus refresh fails", async () => {
    let failRefresh = false;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/notes?")) {
        if (failRefresh) throw new Error("offline");
        return page();
      }
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Learning");

    failRefresh = true;
    window.dispatchEvent(new Event("focus"));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to load notes.");
    expect(wrapper.get(".note-row").text()).toContain("Learning");
    expect(wrapper.find(".notes-empty").exists()).toBe(false);
    await wrapper.unmount();
  });

  it("switches between archived and active notes and restores the URL state", async () => {
    const archivedNote = { ...note, id: "archived-note", title: "Archived draft", deletedAt: "2026-09-03T10:00:00Z" };
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (!path.startsWith("/notes?")) return undefined;
      const params = new URLSearchParams(path.split("?")[1]);
      return params.get("archived") === "true" ? page([archivedNote]) : page([note]);
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Learning");

    await wrapper.get(".notes-pagination-summary button").trigger("click");
    await flushPromises();
    expect(r.currentRoute.value.query.archived).toBe("1");
    expect(wrapper.get(".note-row").text()).toContain("Archived draft");
    expect(wrapper.findAll(".note-row")).toHaveLength(1);
    expect(wrapper.get(".note-row").text()).toContain("Restore");

    await wrapper.get(".notes-pagination-summary button").trigger("click");
    await flushPromises();
    expect(r.currentRoute.value.query.archived).toBeUndefined();
    expect(wrapper.get(".note-row").text()).toContain("Learning");
    expect(wrapper.findAll(".note-row")).toHaveLength(1);
    await wrapper.unmount();
  });

  it("changes page size and pages through notes without repeating records", async () => {
    const notes = Array.from({ length: 25 }, (_, index) => ({
      ...note,
      id: `note-${index}`,
      title: `Note ${String(index).padStart(2, "0")}`,
    }));
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("/notes?")) {
        const params = new URLSearchParams(path.split("?")[1]);
        const size = Number(params.get("size"));
        const pageIndex = Number(params.get("page"));
        return {
          items: notes.slice(pageIndex * size, (pageIndex + 1) * size),
          page: pageIndex,
          size,
          totalItems: notes.length,
          totalPages: Math.ceil(notes.length / size),
        };
      }
      return undefined;
    });
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    expect(wrapper.findAll(".note-row")).toHaveLength(20);

    await wrapper.get('select[aria-label="Notes per page"]').setValue("50");
    await flushPromises();
    expect(wrapper.findAll(".note-row")).toHaveLength(25);
    expect(wrapper.text()).toContain("Page 1 of 1");

    await wrapper.get('select[aria-label="Notes per page"]').setValue("20");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Next")!.trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".note-row strong").map((title) => title.text())).toEqual([
      "Note 20",
      "Note 21",
      "Note 22",
      "Note 23",
      "Note 24",
    ]);
  });

  it("creates a note from the icon action and opens the editor", async () => {
    const created = {
      ...note,
      id: "new-note",
      title: "",
      content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      contentText: "",
    };
    let savedNotes = page();
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes" && options?.method === "POST") {
          savedNotes = page([created]);
          return created;
        }
        if (path.startsWith("/notes?")) return savedNotes;
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
    expect(r.currentRoute.value.fullPath).toBe("/notes/new-note");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/notes",
      expect.objectContaining({ method: "POST" }),
    );
    await r.push("/notes");
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Empty note");
    wrapper.unmount();

    setActivePinia(createPinia());
    const reloadedRouter = router();
    await reloadedRouter.push("/notes");
    await reloadedRouter.isReady();
    const reloaded = mountNotes(reloadedRouter);
    await flushPromises();
    expect(reloaded.get(".note-row").text()).toContain("Empty note");
    reloaded.unmount();
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

  it("applies selected formatting in the note editor and autosaves it", async () => {
    let savedBody = "";
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        const payload = JSON.parse(String(options.body));
        savedBody = payload.content;
        return { ...note, ...payload };
      }
      if (path === "/notes/note-1") return note;
      if (path === "/notes/labels") return [];
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const editor = wrapper.findComponent(EditorContent).props("editor")!;
    editor.commands.setTextSelection({ from: 1, to: 13 });
    await wrapper.get('button[aria-label="Bold"]').trigger("mousedown");
    await wrapper.get('button[aria-label="Bold"]').trigger("click");
    expect(wrapper.get(".ProseMirror strong").text()).toBe("Graph theory");

    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    const persisted = JSON.parse(savedBody);
    expect(persisted.content[0].content[0].marks).toContainEqual({ type: "bold" });
    wrapper.unmount();
  });

  it("preserves list, checklist, quote, and code blocks after save and reopen", async () => {
    let persisted = note;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        persisted = { ...note, ...JSON.parse(String(options.body)) };
        return persisted;
      }
      if (path === "/notes/note-1") return persisted;
      if (path === "/notes/labels") return [];
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const first = mountNotes(r);
    await flushPromises();
    const editor = first.findComponent(EditorContent).props("editor")!;
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Checked item" }] }] }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted text" }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "const answer = 42" }] },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    expect(persisted.content).toContain('"taskList"');
    first.unmount();

    const reopened = mountNotes(r);
    await flushPromises();
    expect(reopened.find(".ProseMirror ul").exists()).toBe(true);
    expect(reopened.find('.ProseMirror ul[data-type="taskList"]').exists()).toBe(true);
    expect(reopened.find(".ProseMirror blockquote").text()).toBe("Quoted text");
    expect(reopened.find(".ProseMirror pre").text()).toBe("const answer = 42");
    reopened.unmount();
  });

  it("pastes rich note content without retaining unsafe markup", async () => {
    let savedContent = "";
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        const payload = JSON.parse(String(options.body));
        savedContent = payload.content;
        return { ...note, ...payload };
      }
      if (path === "/notes/note-1") return note;
      if (path === "/notes/labels") return [];
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const editor = wrapper.findComponent(EditorContent).props("editor")!;
    editor.commands.setTextSelection({ from: 13, to: 13 });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        types: ["text/html", "text/plain"],
        getData: (type: string) => type === "text/html"
          ? '<p>Pasted <strong>formatting</strong><script>unsafe()</script></p>'
          : type === "text/plain" ? "Pasted formattingunsafe()" : "",
        files: [],
      },
    });
    wrapper.get(".ProseMirror").element.dispatchEvent(event);
    await flushPromises();

    expect(wrapper.get(".ProseMirror strong").text()).toBe("formatting");
    expect(wrapper.find(".ProseMirror script").exists()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    expect(savedContent).not.toContain("<script");
    expect(savedContent).toContain('"bold"');
    wrapper.unmount();
  });

  it("toggles a per-line edit-time gutter that the URL remembers", async () => {
    const stamped = { ...note, lineEdits: ["2026-09-02T10:00:00Z"] };
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => (path === "/notes/note-1" && !options ? stamped : undefined));
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const toggle = wrapper.get('button[aria-label="Line history"]');
    expect(toggle.attributes("aria-pressed")).toBe("false");
    expect(wrapper.findAll(".line-history-stamp")).toHaveLength(0);

    await toggle.trigger("click");
    await vi.waitFor(() => expect(r.currentRoute.value.query.lines).toBe("1"));
    await flushPromises();
    expect(wrapper.get('button[aria-label="Line history"]').attributes("aria-pressed")).toBe("true");
    const stamp = wrapper.get(".line-history-stamp time");
    expect(stamp.attributes("datetime")).toBe("2026-09-02T10:00:00.000Z");

    await wrapper.get('button[aria-label="Line history"]').trigger("click");
    await vi.waitFor(() => expect(r.currentRoute.value.query.lines).toBeUndefined());
    await flushPromises();
    expect(wrapper.findAll(".line-history-stamp")).toHaveLength(0);
    expect(api).not.toHaveBeenCalledWith("/notes/note-1", expect.objectContaining({ method: "PUT" }));
  });

  it("saves a plain-text copy with one line per body line, as the extension edits it", async () => {
    const listNote = { ...note, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Intro" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] }] }, { type: "paragraph", content: [{ type: "text", text: "End" }] }] }) };
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => (path === "/notes/note-1" && !options ? listNote : path === "/notes/note-1" ? { ...listNote, version: 1 } : undefined));
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Changed");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    const put = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).contentText).toBe("Intro\nItem\nDone\nEnd");
  });

  it("offers no line history toggle when the note carries no line times", async () => {
    const r = router();
    await r.push("/notes/note-1?lines=1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    expect(wrapper.find('button[aria-label="Line history"]').exists()).toBe(false);
    expect(wrapper.findAll(".line-history-stamp")).toHaveLength(0);
  });

  describe("line history while editing", () => {
    const OLD = "2026-09-02T10:00:00Z";
    const NEW = "2026-09-03T12:30:00Z";
    const stampTexts = (wrapper: ReturnType<typeof mount>) => wrapper.findAll(".rich-editor .line-history-stamp").map((stamp) => stamp.find("time").exists() ? stamp.get("time").attributes("datetime") : stamp.text());
    async function openStamped(handlePut: (body: { content: string; version: number }) => unknown) {
      vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && options?.method === "PUT") return handlePut(JSON.parse(String(options.body)));
        if (path === "/notes/note-1") return { ...note, lineEdits: [OLD] };
        return undefined;
      });
      const r = router();
      await r.push("/notes/note-1?lines=1");
      await r.isReady();
      const wrapper = mountNotes(r);
      await flushPromises();
      const editor = (wrapper.getComponent(NotesView).vm as unknown as { editor: import("@tiptap/core").Editor }).editor;
      return { wrapper, editor };
    }

    it("marks a typed line unsaved, then shows the time the save returned", async () => {
      const { wrapper, editor } = await openStamped((body) => ({ ...note, content: body.content, version: 1, lineEdits: [OLD, NEW] }));
      editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "Fresh idea" }] });
      await flushPromises();
      expect(stampTexts(wrapper)).toEqual(["2026-09-02T10:00:00.000Z", "Unsaved"]);

      await new Promise((resolve) => setTimeout(resolve, 700));
      await flushPromises();
      expect(wrapper.get(".save-state").text()).toBe("Saved");
      expect(stampTexts(wrapper)).toEqual(["2026-09-02T10:00:00.000Z", "2026-09-03T12:30:00.000Z"]);
    });

    it("shows the replayed save's times after another window saved first", async () => {
      let writes = 0;
      const { wrapper, editor } = await openStamped((body) => {
        writes += 1;
        if (writes === 1) throw new Error("Note changed in another window");
        return { ...note, content: body.content, version: body.version + 1, lineEdits: [OLD, NEW] };
      });
      editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "Fresh idea" }] });
      await new Promise((resolve) => setTimeout(resolve, 700));
      await flushPromises();
      expect(writes).toBe(2);
      expect(wrapper.get(".save-state").text()).toBe("Saved");
      expect(stampTexts(wrapper)).toEqual(["2026-09-02T10:00:00.000Z", "2026-09-03T12:30:00.000Z"]);
    });

    it("keeps unsaved lines marked when a save fails", async () => {
      const { wrapper, editor } = await openStamped(() => { throw new Error("offline"); });
      editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "Fresh idea" }] });
      await new Promise((resolve) => setTimeout(resolve, 700));
      await flushPromises();
      expect(wrapper.get(".save-state").text()).toBe("Not saved");
      expect(stampTexts(wrapper)).toEqual(["2026-09-02T10:00:00.000Z", "Unsaved"]);
    });
  });

  it("flushes a pending autosave before navigating back to the note list", async () => {
    const writes: { path: string; body: string }[] = [];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        writes.push({ path, body: String(options.body) });
        return { ...note, ...JSON.parse(String(options.body)) };
      }
      if (path === "/notes/note-1") return note;
      if (path === "/notes/labels") return [];
      if (path === "/notes" || path.startsWith("/notes?")) return page();
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Unsaved before leaving");

    await r.push("/notes");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0].body).title).toBe("Unsaved before leaving");
    wrapper.unmount();
  });

  it("keeps a failed draft in the editor, retries it, then permits navigation", async () => {
    const writes: string[] = [];
    let savedNote = note;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        writes.push(String(options.body));
        if (writes.length === 1) throw new Error("offline");
        savedNote = { ...note, ...JSON.parse(String(options.body)) };
        return savedNote;
      }
      if (path === "/notes/note-1") return note;
      if (path === "/notes/labels") return [];
      if (path === "/notes" || path.startsWith("/notes?")) return page([savedNote]);
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get('input[aria-label="Note title"]').setValue("Keep this draft");

    await r.push("/notes");
    await flushPromises();

    expect(writes).toHaveLength(1);
    expect(r.currentRoute.value.fullPath).toBe("/notes/note-1");
    expect(
      (wrapper.get('input[aria-label="Note title"]').element as HTMLInputElement)
        .value,
    ).toBe("Keep this draft");
    expect(wrapper.get(".save-state").text()).toBe("Not saved");
    await wrapper.get('button[aria-label="Retry save"]').trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    expect(writes).toHaveLength(2);
    expect(wrapper.get(".save-state").text()).toBe("Saved");
    await r.push("/notes");
    await flushPromises();
    expect(r.currentRoute.value.fullPath).toBe("/notes");
    expect(wrapper.text()).toContain("Keep this draft");
    wrapper.unmount();
  });

  it("keeps a failed note draft and retries the save from an explicit action", async () => {
    let writes = 0;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT") {
        writes += 1;
        if (writes === 1) throw new Error("offline");
        return { ...note, ...JSON.parse(String(options.body)) };
      }
      if (path === "/notes/note-1") return note;
      if (path === "/notes/labels") return [];
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const title = wrapper.get<HTMLInputElement>('input[aria-label="Note title"]');
    await title.setValue("Draft after offline save");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    expect(wrapper.get(".save-state").text()).toBe("Not saved");
    expect(title.element.value).toBe("Draft after offline save");
    await wrapper.get('button[aria-label="Retry save"]').trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();

    expect(writes).toBe(2);
    expect(wrapper.get(".save-state").text()).toBe("Saved");
    expect(title.element.value).toBe("Draft after offline save");
    wrapper.unmount();
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

  it("removes only the selected note label and saves the remaining associations", async () => {
    const labeledNote = { ...note, tags: ["study", "Work"] };
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/notes/note-1" && options?.method === "PUT")
        return { ...labeledNote, tags: ["study"] };
      if (path === "/notes/note-1") return labeledNote;
      if (path === "/notes/labels")
        return [{ id: "study", name: "study" }, { id: "work", name: "Work" }];
      return undefined;
    });
    const r = router();
    await r.push("/notes/note-1");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    const input = await openNoteLabels(wrapper);
    await input.trigger("keydown", { key: "Backspace" });
    const chips = wrapper.findAll(".tag-editor .selected-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toContain("study");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flushPromises();
    const writes = vi.mocked(api).mock.calls.filter(([path, options]) =>
      path === "/notes/note-1" && options?.method === "PUT",
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body)).tags).toEqual(["study"]);
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
    const writes: string[] = [];
    const latest = { ...note, version: 1, title: "Remote title" };
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && options?.method === "PUT") {
          writes.push(String(options.body));
          if (writes.length === 1) throw new Error("Note changed in another window");
          return { ...latest, title: "Updated", version: 2 };
        }
        if (path === "/notes/note-1") return writes.length ? latest : note;
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

    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain('"version":1');
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
    const second = { ...note, id: "note-2", title: "Writing" };
    let activeLoads = 0;
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/notes/note-1" && options?.method === "DELETE")
          return undefined;
        if (path.startsWith("/notes?")) {
          const archived = new URLSearchParams(path.split("?")[1]).get("archived");
          return archived === "true"
            ? page([{ ...note, deletedAt: "2026-09-03T10:00:00Z" }])
            : page(activeLoads++ === 0 ? [note, second] : [second]);
        }
        return undefined;
      },
    );
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();
    await wrapper.get(".note-row button.danger").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1", {
      method: "DELETE",
    });
    expect(wrapper.text()).toContain("Writing");
    expect(wrapper.text()).not.toContain("Learning");
    expect(vi.mocked(api).mock.calls.some(([path, options]) =>
      path === "/notes/note-2" && options?.method === "DELETE",
    )).toBe(false);
    await wrapper.get(".notes-pagination-summary button").trigger("click");
    await flushPromises();
    expect(wrapper.get(".note-row").text()).toContain("Learning");
    expect(wrapper.get(".note-row").text()).toContain("Graph theory");
    vi.unstubAllGlobals();
  });

  it("leaves a note unchanged when archive confirmation is cancelled", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const r = router();
    await r.push("/notes");
    await r.isReady();
    const wrapper = mountNotes(r);
    await flushPromises();

    await wrapper.get(".note-row button.danger").trigger("click");

    expect(confirm).toHaveBeenCalledWith(
      "Move “Learning” to Archive? You can restore it from the archive at any time.",
    );
    expect(vi.mocked(api)).not.toHaveBeenCalledWith("/notes/note-1", {
      method: "DELETE",
    });
    expect(wrapper.text()).toContain("Learning");
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
