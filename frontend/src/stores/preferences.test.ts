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

  it("keeps cached values when loading fails", async () => {
    localStorage.setItem("board.kanbanWide", "1");
    vi.mocked(api).mockRejectedValue(new Error("offline"));
    const preferences = usePreferencesStore();
    await preferences.load();
    expect(preferences.kanbanWide).toBe(true);
  });
});
