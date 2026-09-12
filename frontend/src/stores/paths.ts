import { defineStore } from "pinia";
import { api } from "../lib/api";

export type Path = { id: string; name: string; description?: string | null; color?: string | null; status: string };

export const usePathsStore = defineStore("paths", {
  state: () => ({ paths: [] as Path[], loaded: false, loading: false }),
  getters: {
    activePaths: (state) => state.paths.filter((path) => path.status === "ACTIVE"),
    byId: (state) => (id?: string) => state.paths.find((path) => path.id === id),
  },
  actions: {
    async load() {
      this.loading = true;
      try {
        this.paths = await api<Path[]>("/paths");
        this.loaded = true;
        return this.paths;
      } finally {
        this.loading = false;
      }
    },
    add(path: Path) { this.paths = [path, ...this.paths]; },
    replace(path: Path) { this.paths = this.paths.map((value) => value.id === path.id ? path : value); },
    remove(id: string) { this.paths = this.paths.filter((path) => path.id !== id); },
    restore(path: Path) { this.paths = [path, ...this.paths.filter((value) => value.id !== path.id)]; },
  },
});
