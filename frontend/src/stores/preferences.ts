import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";
import { api } from "../lib/api";
import { setThemePreference, themePreference, type ThemePreference } from "../lib/theme";

type Preferences = { theme: ThemePreference; kanbanWide: boolean; recentPathIds: string[]; lastCardBoardId?: string | null };
const KANBAN_WIDE_CACHE = "board.kanbanWide";

function cachedKanbanWide() {
  try { return localStorage.getItem(KANBAN_WIDE_CACHE) === "1"; } catch { return false; }
}
function cacheKanbanWide(value: boolean) {
  try { localStorage.setItem(KANBAN_WIDE_CACHE, value ? "1" : "0"); } catch { /* The cache only speeds up first paint. */ }
}

/**
 * Settings a signed-in user adjusts, stored by the server so they follow the
 * user. The browser keeps a cache of the theme and Kanban width for first
 * paint; the server's values win once loaded.
 */
export const usePreferencesStore = defineStore("preferences", () => {
  const kanbanWide = ref(cachedKanbanWide());
  const recentPathIds = ref<string[]>([]);
  // The board a card added from the All boards view goes to.
  const lastCardBoardId = ref("");
  const loaded = ref(false);
  let applyingServerValues = false;

  async function save(changes: Partial<Omit<Preferences, "recentPathIds">>) {
    await api("/preferences", { method: "PUT", body: JSON.stringify(changes) });
  }

  async function load() {
    try {
      const stored = await api<Preferences>("/preferences");
      if (!stored) return;
      applyingServerValues = true;
      setThemePreference(stored.theme);
      kanbanWide.value = stored.kanbanWide;
      cacheKanbanWide(stored.kanbanWide);
      recentPathIds.value = [...(stored.recentPathIds || [])];
      lastCardBoardId.value = stored.lastCardBoardId || "";
      loaded.value = true;
    } catch {
      /* Keep the cached values; the next sign-in or reload tries again. */
    } finally {
      applyingServerValues = false;
    }
  }

  // Any theme change (the shell's toggle, Settings) is saved once signed in.
  watch(themePreference, (theme) => {
    if (!loaded.value || applyingServerValues) return;
    void save({ theme }).catch(() => undefined);
  }, { flush: "sync" });

  async function setKanbanWide(value: boolean) {
    kanbanWide.value = value;
    cacheKanbanWide(value);
    if (loaded.value) await save({ kanbanWide: value }).catch(() => undefined);
  }

  async function setLastCardBoard(boardId: string) {
    if (lastCardBoardId.value === boardId) return;
    lastCardBoardId.value = boardId;
    if (loaded.value) await save({ lastCardBoardId: boardId }).catch(() => undefined);
  }

  function reset() {
    loaded.value = false;
    recentPathIds.value = [];
    lastCardBoardId.value = "";
  }

  return { kanbanWide, recentPathIds, lastCardBoardId, loaded, load, setKanbanWide, setLastCardBoard, reset };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePreferencesStore, import.meta.hot));
