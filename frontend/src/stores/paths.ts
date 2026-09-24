import { defineStore } from "pinia";
import { api } from "../lib/api";
import { useBoardsStore } from "./boards";

export type Path = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  status: string;
  pinned?: boolean;
  sortOrder?: number;
  // Every path owns a board; boardHidden hides it from the board tabs.
  boardId?: string | null;
  boardHidden?: boolean;
};
// Every path owns a board named after it, so a path change leaves cached boards stale.
function boardsChanged() {
  useBoardsStore().invalidate();
}

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
      if (force) boardsChanged();
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
      boardsChanged();
      this.paths = [...this.paths, path];
    },
    replace(path: Path) {
      boardsChanged();
      this.paths = this.paths.map((value) =>
        value.id === path.id ? path : value,
      );
    },
    remove(id: string) {
      boardsChanged();
      this.paths = this.paths.filter((path) => path.id !== id);
    },
    restore(path: Path) {
      boardsChanged();
      this.paths = [...this.paths.filter((value) => value.id !== path.id), path];
    },
    setPinned(path: Path) {
      boardsChanged();
      this.paths = this.paths.map((value) => value.id === path.id ? path : value);
    },
    setOrder(paths: Path[]) {
      boardsChanged();
      this.paths = paths;
    },
  },
});
