import { defineStore } from "pinia";
import { api } from "../lib/api";

export type Path = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  status: string;
};
let loadPromise: Promise<Path[]> | null = null;
let loadRevision = 0;

export const usePathsStore = defineStore("paths", {
  state: () => ({ paths: [] as Path[], loaded: false, loading: false }),
  getters: {
    activePaths: (state) =>
      state.paths.filter((path) => path.status === "ACTIVE"),
    byId: (state) => (id?: string) =>
      state.paths.find((path) => path.id === id),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.paths;
      if (loadPromise && !force) return loadPromise;
      this.loading = true;
      loadPromise = api<Path[]>("/paths");
      const request = loadPromise;
      const revision = loadRevision;
      try {
        const paths = await request;
        if (revision !== loadRevision) return this.paths;
        this.paths = paths;
        this.loaded = true;
        return this.paths;
      } finally {
        this.loading = false;
        loadPromise = null;
      }
    },
    setAll(paths: Path[]) {
      this.paths = paths;
      this.loaded = true;
    },
    reset() {
      loadRevision++;
      this.paths = [];
      this.loaded = false;
      this.loading = false;
      loadPromise = null;
    },
    add(path: Path) {
      this.paths = [path, ...this.paths];
    },
    replace(path: Path) {
      this.paths = this.paths.map((value) =>
        value.id === path.id ? path : value,
      );
    },
    remove(id: string) {
      this.paths = this.paths.filter((path) => path.id !== id);
    },
    restore(path: Path) {
      this.paths = [
        path,
        ...this.paths.filter((value) => value.id !== path.id),
      ];
    },
  },
});
