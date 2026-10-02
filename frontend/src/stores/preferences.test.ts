import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { applyTheme, themePreference, toggleTheme, setThemePreference } from "../lib/theme";
import { usePreferencesStore } from "./preferences";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("preferences store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api).mockReset();
    localStorage.clear();
    setThemePreference("auto");
    applyTheme("light");
  });
  // The store watches the app-wide theme ref, so stop each test's store.
  afterEach(() => usePreferencesStore().$dispose());

  // UP-04, UP-05, UP-06
  it("loads the server's preferences without saving them back", async () => {
    vi.mocked(api).mockResolvedValue({ theme: "dark", kanbanWide: true, recentPathIds: ["path-2", "path-1"] });
    const preferences = usePreferencesStore();
    await preferences.load();
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/preferences");
    expect(themePreference.value).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(preferences.kanbanWide).toBe(true);
    expect(preferences.ganttWide).toBe(false);
    expect(preferences.recentPathIds).toEqual(["path-2", "path-1"]);
    expect(api).not.toHaveBeenCalledWith("/preferences", expect.objectContaining({ method: "PUT" }));
  });

  // UP-04
  it("saves theme changes once loaded", async () => {
    vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: false, recentPathIds: [] });
    const preferences = usePreferencesStore();
    await preferences.load();
    toggleTheme();
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ theme: "dark" }) }));
  });

  // UP-04
  it("does not save while signed out", async () => {
    usePreferencesStore();
    toggleTheme();
    await flushPromises();
    expect(api).not.toHaveBeenCalled();
    expect(localStorage.getItem("knowledge-base-theme")).toBe("dark");
  });

  // UP-05
  it("saves the Kanban width", async () => {
    vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: false, recentPathIds: [] });
    const preferences = usePreferencesStore();
    await preferences.load();
    await preferences.setKanbanWide(true);
    expect(preferences.kanbanWide).toBe(true);
    expect(api).toHaveBeenCalledWith("/preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ kanbanWide: true }) }));
  });

  it("saves Gantt width independently from Kanban width", async () => {
    vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: true, ganttWide: false, recentPathIds: [] });
    const preferences = usePreferencesStore();
    await preferences.load();
    await preferences.setGanttWide(true);
    expect(preferences.kanbanWide).toBe(true);
    expect(preferences.ganttWide).toBe(true);
    expect(localStorage.getItem("board.ganttWide")).toBe("1");
    expect(api).toHaveBeenCalledWith("/preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ ganttWide: true }) }));
  });

  it("keeps cached values when loading fails", async () => {
    localStorage.setItem("board.kanbanWide", "1");
    vi.mocked(api).mockRejectedValue(new Error("offline"));
    const preferences = usePreferencesStore();
    await preferences.load();
    expect(preferences.kanbanWide).toBe(true);
  });

  // BS-01, BS-02
  it("loads the board state, reading a null board as All boards", async () => {
    const preferences = usePreferencesStore();
    expect(preferences.board).toEqual({ boardId: "all", view: "kanban", ganttFrom: "", ganttTo: "", ganttSorts: [], ganttShowPriority: false, ganttShowStatus: false, ganttShowPath: false, search: "" });
    vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: false, recentPathIds: [], board: { boardId: "work", view: "gantt", ganttFrom: "2026-09-01", ganttTo: "2026-09-14", ganttSorts: ["PRIORITY", "DATE"], search: "release" } });
    await preferences.load();
    expect(preferences.board).toEqual({ boardId: "work", view: "gantt", ganttFrom: "2026-09-01", ganttTo: "2026-09-14", ganttSorts: ["PRIORITY_ASC", "DATE_ASC"], ganttShowPriority: false, ganttShowStatus: false, ganttShowPath: false, search: "release" });
    vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: false, recentPathIds: [], board: { boardId: null, view: "kanban", ganttFrom: null, ganttTo: null, search: "" } });
    await preferences.load();
    expect(preferences.board).toEqual({ boardId: "all", view: "kanban", ganttFrom: "", ganttTo: "", ganttSorts: [], ganttShowPriority: false, ganttShowStatus: false, ganttShowPath: false, search: "" });
  });

  // BS-03
  it("saves the board state once, after changes settle", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api).mockResolvedValue({ theme: "auto", kanbanWide: false, recentPathIds: [] });
      const preferences = usePreferencesStore();
      await preferences.load();
      preferences.setBoardState({ ...preferences.board, boardId: "work", view: "kanban", ganttFrom: "", ganttTo: "", ganttSorts: [], search: "rel" });
      preferences.setBoardState({ ...preferences.board, boardId: "all", view: "gantt", ganttFrom: "2026-09-01", ganttTo: "2026-09-14", ganttSorts: ["PRIORITY_ASC", "DATE_DESC"], ganttShowStatus: true, search: "release" });
      expect(preferences.board.search).toBe("release");
      expect(api).not.toHaveBeenCalledWith("/preferences", expect.objectContaining({ method: "PUT" }));
      await vi.runAllTimersAsync();
      const puts = vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "PUT");
      expect(puts).toHaveLength(1);
      expect(JSON.parse(String(puts[0][1]!.body))).toEqual({ board: { boardId: null, view: "gantt", ganttFrom: "2026-09-01", ganttTo: "2026-09-14", ganttSorts: ["PRIORITY_ASC", "DATE_DESC"], ganttShowPriority: false, ganttShowStatus: true, ganttShowPath: false, search: "release" } });
    } finally {
      vi.useRealTimers();
    }
  });

  // BS-03
  it("does not save the board state while signed out", async () => {
    vi.useFakeTimers();
    try {
      const preferences = usePreferencesStore();
      preferences.setBoardState({ ...preferences.board, boardId: "work", view: "kanban", ganttFrom: "", ganttTo: "", ganttSorts: [], search: "" });
      await vi.runAllTimersAsync();
      expect(api).not.toHaveBeenCalled();
      preferences.reset();
      expect(preferences.board.boardId).toBe("all");
    } finally {
      vi.useRealTimers();
    }
  });
});
