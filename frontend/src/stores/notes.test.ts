import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "./notes";

describe("notes store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("keeps list and selected note changes reactive", () => {
    const store = useNotesStore();
    const note = {
      id: "n1",
      title: "First",
      content: "",
      createdAt: "",
      updatedAt: "",
      version: 1,
      tags: [],
    };
    store.setPage([note]);
    store.setSelected(note);
    expect(store.notes).toHaveLength(1);
    expect(store.selected?.title).toBe("First");

    store.upsert({ ...note, title: "Updated" });
    expect(store.notes[0].title).toBe("Updated");
    store.remove("n1");
    expect(store.notes).toHaveLength(0);
  });
});
