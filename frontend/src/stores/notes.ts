import { defineStore } from "pinia";

export type Note = {
  id: string;
  title: string;
  content: string;
  contentText?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  tags: string[];
  pinned?: boolean;
  sortOrder?: number;
};
export type NoteLabel = { id: string; name: string };

export const useNotesStore = defineStore("notes", {
  state: () => ({
    notes: [] as Note[],
    selected: null as Note | null,
    existingLabels: [] as NoteLabel[],
    pages: {} as Record<
      string,
      {
        items: Note[];
        page: number;
        size: number;
        totalItems: number;
        totalPages: number;
      }
    >,
  }),
  actions: {
    setPage(
      key: string | Note[],
      page?: {
        items: Note[];
        page: number;
        size: number;
        totalItems: number;
        totalPages: number;
      },
    ) {
      if (Array.isArray(key)) {
        this.notes = key;
        return;
      }
      if (!page) return;
      this.notes = page.items;
      this.pages[key] = page;
    },
    cachedPage(key: string) {
      return this.pages[key];
    },
    clearPages() {
      this.pages = {};
    },
    upsert(note: Note) {
      const index = this.notes.findIndex((value) => value.id === note.id);
      if (index < 0) this.notes = [note, ...this.notes];
      else
        this.notes = this.notes.map((value, currentIndex) =>
          currentIndex === index ? note : value,
        );
    },
    remove(id: string) {
      this.notes = this.notes.filter((note) => note.id !== id);
      this.pages = Object.fromEntries(
        Object.entries(this.pages).map(([key, page]) => [
          key,
          { ...page, items: page.items.filter((note) => note.id !== id) },
        ]),
      );
    },
    setSelected(note: Note | null) {
      this.selected = note;
    },
    setLabels(labels: NoteLabel[]) {
      this.existingLabels = labels;
    },
    setPinned(note: Note) {
      this.notes = this.notes.map((value) => value.id === note.id ? note : value);
    },
    setOrder(notes: Note[]) {
      this.notes = notes;
    },
  },
});
