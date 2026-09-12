import { defineStore } from "pinia";
import { api } from "../lib/api";

export type LabelScope = "NOTE" | "CALENDAR" | "TIME_ENTRY";
export type Label = { id: string; name: string; color?: string | null; scopes: LabelScope[] };

export const useLabelsStore = defineStore("labels", {
  state: () => ({ labels: [] as Label[], loaded: false, loading: false }),
  getters: {
    byId: (state) => (id?: string) => state.labels.find((label) => label.id === id),
    forScope: (state) => (scope: LabelScope) => state.labels.filter((label) => label.scopes.includes(scope)),
  },
  actions: {
    async load() {
      this.loading = true;
      try {
        this.labels = await api<Label[]>("/labels");
        this.loaded = true;
        return this.labels;
      } finally {
        this.loading = false;
      }
    },
    setAll(labels: Label[]) { this.labels = labels; this.loaded = true; },
    replace(label: Label) { this.labels = this.labels.map((value) => value.id === label.id ? label : value); },
    add(label: Label) { this.labels = [...this.labels, label]; },
    remove(id: string) { this.labels = this.labels.filter((label) => label.id !== id); },
  },
});
