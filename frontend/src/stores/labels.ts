import { defineStore } from "pinia";
import { api } from "../lib/api";

export type LabelScope = "NOTE" | "CALENDAR" | "TIME_ENTRY" | "LOG";
export type Label = { id: string; name: string; color?: string | null; scopes: LabelScope[]; system?: boolean };
const scopeLoadPromises = new Map<LabelScope, Promise<Label[]>>();

export const useLabelsStore = defineStore("labels", {
  state: () => ({ labels: [] as Label[], loaded: false, loadedScopes: [] as LabelScope[], loading: false }),
  getters: {
    byId: (state) => (id?: string) => state.labels.find((label) => label.id === id),
    forScope: (state) => (scope: LabelScope) => state.labels.filter((label) => label.scopes?.includes(scope)),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.labels;
      this.loading = true;
      try {
        this.labels = await api<Label[]>("/labels");
        this.loaded = true;
        this.loadedScopes = ["NOTE", "CALENDAR", "TIME_ENTRY", "LOG"];
        return this.labels;
      } finally {
        this.loading = false;
      }
    },
    async loadScope(scope: LabelScope, force = false) {
      if (this.loadedScopes.includes(scope) && !force) return this.labels.filter((label) => label.scopes.includes(scope));
      const pending = scopeLoadPromises.get(scope);
      if (pending && !force) return pending;
      this.loading = true;
      const request = api<Label[]>(`/labels?scope=${scope}`);
      scopeLoadPromises.set(scope, request);
      try {
        const scoped = await request;
        const ids = new Set(scoped.map((label) => label.id));
        this.labels = [...this.labels.filter((label) => !ids.has(label.id)), ...scoped];
        this.loaded = true;
        this.loadedScopes = [...new Set([...this.loadedScopes, scope])];
        return scoped;
      } finally {
        this.loading = false;
        scopeLoadPromises.delete(scope);
      }
    },
    setAll(labels: Label[], scope?: LabelScope) {
      if (!scope) {
        this.labels = labels;
        this.loaded = true;
        this.loadedScopes = ["NOTE", "CALENDAR", "TIME_ENTRY", "LOG"];
        return;
      }
      const ids = new Set(labels.map((label) => label.id));
      this.labels = [...this.labels.filter((label) => !ids.has(label.id)), ...labels];
      this.loaded = true;
      this.loadedScopes = [...new Set([...this.loadedScopes, scope])];
    },
    replace(label: Label) { this.labels = this.labels.map((value) => value.id === label.id ? label : value); },
    add(label: Label) { this.labels = [...this.labels, label]; },
    remove(id: string) { this.labels = this.labels.filter((label) => label.id !== id); },
  },
});
