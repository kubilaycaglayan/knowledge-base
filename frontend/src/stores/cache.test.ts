import { createPinia, setActivePinia } from "pinia";
import { api } from "../lib/api";
import { useCalendarStore } from "./calendar";
import { useLabelsStore } from "./labels";
import { useNotesStore, type Note } from "./notes";
import { usePathsStore } from "./paths";
import { useReportsStore } from "./reports";
import { useSessionsStore } from "./sessions";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const path = { id: "path-1", name: "Study", status: "ACTIVE" };
const label = { id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] as const };
const note: Note = { id: "note-1", title: "A note", content: "", createdAt: "", updatedAt: "", version: 1, tags: [] };

describe("reactive store caches", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("caches paths and reloads only when forced", async () => {
    vi.mocked(api).mockResolvedValue([path]);
    const store = usePathsStore();

    await store.load();
    await store.load();
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);

    await store.load(true);
    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
    expect(store.byId(path.id)?.name).toBe("Study");
  });

  it("deduplicates concurrent path loads", async () => {
    let resolve: ((value: typeof path[]) => void) | undefined;
    vi.mocked(api).mockReturnValue(new Promise((done) => { resolve = done; }));
    const store = usePathsStore();
    const first = store.load();
    const second = store.load();

    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
    resolve?.([path]);
    await Promise.all([first, second]);
    expect(store.paths).toEqual([path]);
  });

  it("cleans up a failed path load so a later retry can succeed", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([path]);
    const store = usePathsStore();

    await expect(store.load()).rejects.toThrow("network");
    expect(store.loading).toBe(false);
    await store.load();
    expect(store.paths).toEqual([path]);
    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("caches labels per scope while preserving reactive scoped mutations", async () => {
    vi.mocked(api).mockResolvedValue([label]);
    const store = useLabelsStore();

    await store.loadScope("TIME_ENTRY");
    await store.loadScope("TIME_ENTRY");
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);

    store.replace({ ...label, name: "Deep focus", scopes: ["NOTE"] });
    expect(store.forScope("TIME_ENTRY")).toHaveLength(0);
    expect(store.byId(label.id)?.name).toBe("Deep focus");

    await store.loadScope("TIME_ENTRY", true);
    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("caches an empty label scope without treating it as an error", async () => {
    vi.mocked(api).mockResolvedValue([]);
    const store = useLabelsStore();

    await expect(store.loadScope("CALENDAR")).resolves.toEqual([]);
    await store.loadScope("CALENDAR");
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  });

  it("removes empty calendar days but keeps populated days reactive", () => {
    const store = useCalendarStore();
    const day = { date: "2026-09-12", note: "Milestone", labels: [] };
    store.setRange("2026-09-01:2026-09-30", [day]);
    expect(store.byDate(day.date)?.note).toBe("Milestone");

    store.setDay({ ...day, note: null });
    expect(store.byDate(day.date)).toBeUndefined();
    expect(store.loadedRanges).toContain("2026-09-01:2026-09-30");
  });

  it("caches note and session pages and invalidates note pages on removal", () => {
    const notes = useNotesStore();
    const notePage = { items: [note], page: 0, size: 20, totalItems: 1, totalPages: 1 };
    notes.setPage("page=0", notePage);
    expect(notes.cachedPage("page=0")?.items).toEqual([note]);
    notes.remove(note.id);
    expect(notes.cachedPage("page=0")?.items).toEqual([]);

    const sessions = useSessionsStore();
    const sessionPage = { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
    sessions.setPage("0:50", sessionPage);
    expect(sessions.cachedPage("0:50")).toEqual(sessionPage);
    sessions.clearPages();
    expect(sessions.cachedPage("0:50")).toBeUndefined();
  });

  it("clears cached reports after a reactive state change", () => {
    const store = useReportsStore();
    store.set("report-key", { totalSeconds: 60 });
    expect(store.get<{ totalSeconds: number }>("report-key")?.totalSeconds).toBe(60);
    store.clear();
    expect(store.get("report-key")).toBeUndefined();
  });
});
