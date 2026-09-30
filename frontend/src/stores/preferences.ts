import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";
import { api } from "../lib/api";
import { ALL_BOARDS } from "../lib/board-merge";
import { setThemePreference, themePreference, type ThemePreference } from "../lib/theme";

/** The Boards page state: the open board (ALL_BOARDS for All boards), view, Gantt range ("" when unset), and card search. */
export type GanttSortRule = "PRIORITY" | "DATE";
export type BoardViewState = { boardId: string; view: "kanban" | "gantt"; ganttFrom: string; ganttTo: string; ganttSorts: GanttSortRule[]; search: string };
type StoredBoardState = { boardId: string | null; view: "kanban" | "gantt"; ganttFrom: string | null; ganttTo: string | null; ganttSorts?: GanttSortRule[]; search: string };
type Preferences = { theme: ThemePreference; kanbanWide: boolean; recentPathIds: string[]; lastCardBoardId?: string | null; board?: StoredBoardState };
type PreferenceChanges = Partial<Omit<Preferences, "recentPathIds">>;
// Typing a search saves once the user pauses, not on every keystroke.
const BOARD_SAVE_DELAY_MS = 400;
const defaultBoardState = (): BoardViewState => ({ boardId: ALL_BOARDS, view: "kanban", ganttFrom: "", ganttTo: "", ganttSorts: [], search: "" });
const sameBoardState = (a: BoardViewState, b: BoardViewState) => a.boardId === b.boardId && a.view === b.view && a.ganttFrom === b.ganttFrom && a.ganttTo === b.ganttTo && a.ganttSorts.join(",") === b.ganttSorts.join(",") && a.search === b.search;
function fromStored(stored?: StoredBoardState): BoardViewState {
  if (!stored) return defaultBoardState();
  return { boardId: stored.boardId || ALL_BOARDS, view: stored.view === "gantt" ? "gantt" : "kanban", ganttFrom: stored.ganttFrom || "", ganttTo: stored.ganttTo || "", ganttSorts: (stored.ganttSorts || []).filter((rule): rule is GanttSortRule => rule === "PRIORITY" || rule === "DATE"), search: stored.search || "" };
}
function toStored(state: BoardViewState): StoredBoardState {
  return { boardId: state.boardId === ALL_BOARDS ? null : state.boardId, view: state.view, ganttFrom: state.ganttFrom || null, ganttTo: state.ganttTo || null, ganttSorts: state.ganttSorts, search: state.search };
}
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
 * paint; the server's values win once loaded. The Boards page state lives here
 * too, so it survives leaving the page, reloads, and new sign-ins.
 */
export const usePreferencesStore = defineStore("preferences", () => {
  const kanbanWide = ref(cachedKanbanWide());
  const recentPathIds = ref<string[]>([]);
  // The board a card added from the All boards view goes to.
  const lastCardBoardId = ref("");
  const board = ref<BoardViewState>(defaultBoardState());
  const loaded = ref(false);
  let applyingServerValues = false;
  let loading: Promise<void> | null = null;
  let boardSaveTimer: ReturnType<typeof setTimeout> | undefined;

  async function save(changes: PreferenceChanges) {
    await api("/preferences", { method: "PUT", body: JSON.stringify(changes) });
  }

  function load() {
    loading = fetchPreferences();
    return loading;
  }

  /** Resolves once the latest load has finished, so pages can read the server's values. */
  function ready() {
    return loading ?? Promise.resolve();
  }

  async function fetchPreferences() {
    try {
      const stored = await api<Preferences>("/preferences");
      if (!stored) return;
      applyingServerValues = true;
      setThemePreference(stored.theme);
      kanbanWide.value = stored.kanbanWide;
      cacheKanbanWide(stored.kanbanWide);
      recentPathIds.value = [...(stored.recentPathIds || [])];
      lastCardBoardId.value = stored.lastCardBoardId || "";
      clearTimeout(boardSaveTimer);
      board.value = fromStored(stored.board);
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

  function setBoardState(next: BoardViewState) {
    if (sameBoardState(board.value, next)) return;
    board.value = { ...next };
    if (!loaded.value) return;
    clearTimeout(boardSaveTimer);
    boardSaveTimer = setTimeout(() => { void save({ board: toStored(board.value) }).catch(() => undefined); }, BOARD_SAVE_DELAY_MS);
  }

  function reset() {
    clearTimeout(boardSaveTimer);
    loading = null;
    board.value = defaultBoardState();
    loaded.value = false;
    recentPathIds.value = [];
    lastCardBoardId.value = "";
  }

  return { kanbanWide, recentPathIds, lastCardBoardId, board, loaded, load, ready, setKanbanWide, setLastCardBoard, setBoardState, reset };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePreferencesStore, import.meta.hot));
