import { defineStore } from "pinia";

export type Note = {
  id: string; title: string; content: string; contentText?: string;
  createdAt: string; updatedAt: string; deletedAt?: string; version: number; tags: string[];
};
export type NoteLabel = { id: string; name: string };

export const useNotesStore = defineStore("notes", {
  state: () => ({ notes: [] as Note[], selected: null as Note | null, existingLabels: [] as NoteLabel[] }),
  actions: {
    setPage(notes: Note[]) { this.notes = notes; },
    upsert(note: Note) {
      const index = this.notes.findIndex((value) => value.id === note.id);
      if (index < 0) this.notes = [note, ...this.notes];
      else this.notes = this.notes.map((value, currentIndex) => currentIndex === index ? note : value);
    },
    remove(id: string) { this.notes = this.notes.filter((note) => note.id !== id); },
    setSelected(note: Note | null) { this.selected = note; },
    setLabels(labels: NoteLabel[]) { this.existingLabels = labels; },
  },
});
