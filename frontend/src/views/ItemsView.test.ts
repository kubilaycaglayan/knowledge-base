import { flushPromises, mount } from "@vue/test-utils";
import ItemsView from "./ItemsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ItemsView", () => {
  const mountItems = () => mount(ItemsView, { global: { stubs: { ProgressBar: true } } });

  it("shows archived memberships while offering only active paths for new items", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items")
        return [
          {
            id: "item-1",
            title: "Existing item",
            source: "https://example.com/book",
            type: "BOOK",
            status: "PLANNED",
            progress: 0,
            pathIds: ["archived"],
            tags: [],
          },
        ];
      if (path === "/paths")
        return [
          { id: "active", name: "Current path", status: "ACTIVE" },
          { id: "archived", name: "Finished path", status: "ARCHIVED" },
        ];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();

    expect(wrapper.text()).toContain("Finished path");
    expect(wrapper.text()).toContain("https://example.com/book");
    expect(wrapper.find("fieldset legend").text()).toBe("Active paths");
    expect(wrapper.findAll("fieldset input")).toHaveLength(1);
    expect(wrapper.find("fieldset input").attributes("value")).toBe("active");
  });

  it("offers the supported item types when adding a resource", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [];
      if (path === "/paths") return [{ id: "path-1", name: "Learning", status: "ACTIVE" }];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    const type = wrapper.get('select[aria-label="Item type"]');
    expect(type.findAll("option").map((option) => option.text())).toContain(
      "MOVIE",
    );
    expect(type.findAll("option").map((option) => option.text())).toContain(
      "PAPER",
    );
    await type.setValue("MOVIE");
    await wrapper
      .get('input[aria-label="Item title"]')
      .setValue("A film to revisit");
    await wrapper
      .get('input[aria-label="Item source"]')
      .setValue("Criterion Collection");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.get('input[aria-label="Tags"]').setValue("film, revisit");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"MOVIE"'),
      }),
    );
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"source":"Criterion Collection"'),
      }),
    );
    const addCall = vi.mocked(api).mock.calls.find(([path, options]) => path === "/items" && options?.method === "POST");
    expect(addCall?.[1]?.body).toContain('"pathIds":["path-1"]');
    expect(addCall?.[1]?.body).toContain('"tags":["film","revisit"]');
  });

  it("opens one dialog with all item properties and saves them together", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items")
        return [
          {
            id: "item-1",
            title: "Existing item",
            description: "Old description",
            source: "Old source",
            type: "BOOK",
            status: "PLANNED",
            progress: 20,
            pathIds: ["path-1"],
            tags: ["old"],
          },
        ];
      if (path === "/paths")
        return [{ id: "path-1", name: "Learning", status: "ACTIVE" }];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();

    await wrapper.get("button.text-button").trigger("click");
    expect(wrapper.find(".edit-dialog").exists()).toBe(true);
    expect(wrapper.findAll(".edit-dialog")).toHaveLength(1);
    expect(
      (wrapper.get('input[aria-label="Edit item title"]').element as HTMLInputElement)
        .value,
    ).toBe("Existing item");
    expect(
      (wrapper.get('textarea[aria-label="Edit item description"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("Old description");

    await wrapper
      .get('input[aria-label="Edit item title"]')
      .setValue("Updated item");
    await wrapper.get('select[aria-label="Edit item type"]').setValue("MOVIE");
    await wrapper
      .get('select[aria-label="Edit item status"]')
      .setValue("ACTIVE");
    await wrapper.get('.edit-path-picker input[type="checkbox"]').setValue(true);
    await wrapper
      .get('input[aria-label="Edit item tags"]')
      .setValue("film, revisit");
    await wrapper.get(".edit-dialog button.primary").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items/item-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"title":"Updated item"'),
      }),
    );
    const update = vi
      .mocked(api)
      .mock.calls.find(([path, options]) => path === "/items/item-1" && options);
    expect(update?.[1]?.body).toContain('"type":"MOVIE"');
    expect(update?.[1]?.body).toContain('"status":"ACTIVE"');
    expect(update?.[1]?.body).toContain('"pathIds":["path-1"]');
    expect(update?.[1]?.body).toContain('"tags":["film","revisit"]');
  });
  it("updates progress, expands history, and adds an item note", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths" || path === "/notes") return [];
      if (path === "/items/item-1/progress") return [{ id: "change-1", previousProgress: 20, newProgress: 50, changedAt: "2026-08-27T12:00:00Z" }];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    await wrapper.get("button.progress-button").trigger("click");
    await wrapper.get('.prompt-dialog input').setValue("50");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/items/item-1/progress", expect.objectContaining({ method: "POST", body: '{"progress":50}' }));
    await wrapper.findAll("button.text-button").find((button) => button.text() === "0 notes")!.trigger("click");
    await wrapper.get('input[aria-label="Note title"]').setValue("Key idea");
    await wrapper.get('textarea[aria-label="Note content"]').setValue("Review spaced repetition.");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes", expect.objectContaining({ method: "POST", body: JSON.stringify({ itemId: "item-1", title: "Key idea", content: "Review spaced repetition." }) }));
    await wrapper.findAll("button.text-button").find((button) => button.text() === "History")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("20% → 50%");
  });

  it("shows a load error when items, paths, or notes cannot be retrieved", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network"));
    const wrapper = mountItems();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to load items.");
  });

  it("edits an existing item note through the two-step prompt", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths") return [];
      if (path === "/notes") return [{ id: "note-1", itemId: "item-1", title: "Old title", content: "Old content" }];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "1 notes")!.trigger("click");
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit note")!.trigger("click");
    await wrapper.get('input[aria-label="Note title"]').setValue("New title");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await wrapper.get('textarea[aria-label="Note content"]').setValue("New content");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/notes/note-1", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ title: "New title", content: "New content" }),
    }));
  });

  it("toggles the note editor and does not edit a note after cancellation", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths") return [];
      if (path === "/notes") return [{ id: "note-1", itemId: "item-1", title: "Old title", content: "Old content" }];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    const notesButton = wrapper.findAll("button.text-button").find((button) => button.text() === "1 notes")!;
    await notesButton.trigger("click");
    expect(wrapper.find(".note-editor").exists()).toBe(true);
    await notesButton.trigger("click");
    expect(wrapper.find(".note-editor").exists()).toBe(false);

    vi.clearAllMocks();
    await wrapper.findAll("button.text-button").find((button) => button.text() === "1 notes")!.trigger("click");
    await wrapper.findAll("button.text-button").find((button) => button.text() === "Edit note")!.trigger("click");
    await wrapper.get(".prompt-dialog .text-button").trigger("click");
    await flushPromises();
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/notes/note-1" && options?.method === "PUT")).toBe(false);
  });

  it("shows errors when progress, history, and note mutations fail", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths" || path === "/notes") return options?.method === "POST" ? Promise.reject(new Error("note failed")) : [];
      if (path === "/items/item-1/progress" && options?.method === "POST") throw new Error("progress failed");
      if (path === "/items/item-1/progress") throw new Error("history failed");
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();

    await wrapper.get("button.progress-button").trigger("click");
    await wrapper.get('.prompt-dialog input').setValue("50");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not update progress.");

    await wrapper.findAll("button.text-button").find((button) => button.text() === "History")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not load item history.");

    await wrapper.findAll("button.text-button").find((button) => button.text() === "0 notes")!.trigger("click");
    await wrapper.get('input[aria-label="Note title"]').setValue("Title");
    await wrapper.get('textarea[aria-label="Note content"]').setValue("Content");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not save note.");
  });

  it("reports item creation and update failures", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/items" && !options?.method) return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths" || path === "/notes") return [];
      throw new Error("mutation failed");
    });
    const wrapper = mountItems();
    await flushPromises();
    await wrapper.get('input[aria-label="Item title"]').setValue("New item");
    await wrapper.get("form.item-form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not create item.");

    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get("form.edit-dialog").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not update item.");
  });

  it("does not submit blank items or notes and can cancel the edit dialog", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths" || path === "/notes") return [];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    vi.clearAllMocks();

    await wrapper.get("form.item-form").trigger("submit");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/items" && options?.method === "POST")).toBe(false);

    await wrapper.get("button.text-button").trigger("click");
    await wrapper.get(".edit-dialog button.text-button").trigger("click");
    expect(wrapper.find(".edit-dialog").exists()).toBe(false);

    await wrapper.findAll("button.text-button").find((button) => button.text() === "0 notes")!.trigger("click");
    await wrapper.get('input[aria-label="Note title"]').setValue(" ");
    await wrapper.get('textarea[aria-label="Note content"]').setValue(" ");
    await wrapper.findAll("button.primary").find((button) => button.text() === "Save note")!.trigger("click");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/notes" && options?.method === "POST")).toBe(false);
  });

  it("rejects unsupported edit type and status values before sending a request", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [{ id: "item-1", title: "Study", type: "BOOK", status: "ACTIVE", progress: 20, pathIds: [], tags: [] }];
      if (path === "/paths" || path === "/notes") return [];
      return undefined;
    });
    const wrapper = mountItems();
    await flushPromises();
    vi.clearAllMocks();
    await wrapper.get("button.text-button").trigger("click");
    const vm = wrapper.vm as unknown as { editType: string; editStatus: string };
    vm.editType = "UNSUPPORTED";
    vm.editStatus = "UNSUPPORTED";
    await wrapper.get("form.edit-dialog").trigger("submit");

    expect(wrapper.get('[role="alert"]').text()).toBe("Choose valid item type and status values.");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/items/item-1" && options?.method === "PUT")).toBe(false);
  });
});
