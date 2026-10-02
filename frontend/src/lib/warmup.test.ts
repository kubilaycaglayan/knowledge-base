import { createPinia, setActivePinia } from "pinia";
import { api } from "./api";
import {
  WARMUP_COOLDOWN_MS,
  WARMUP_STAMP_KEY,
  clearWarmupCooldown,
  pageDataTasks,
  routeChunkTasks,
  scheduleWarmup,
  warmupMode,
  type WarmupOptions,
  type WarmupTask,
} from "./warmup";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { useSessionsStore } from "../stores/sessions";
import { useNotesStore } from "../stores/notes";
import { useCalendarStore } from "../stores/calendar";
import { useReportsStore } from "../stores/reports";
import { useLogsStore } from "../stores/logs";

vi.mock("./api", () => ({ api: vi.fn() }));

const today = new Date("2026-10-02T12:00:00");
const report = {
  period: "WEEK",
  from: "2026-09-28",
  to: "2026-10-04",
  totalSeconds: 0,
  days: [],
  paths: [],
  sessionLabels: [],
  calendarLabels: [],
};

function respond(path: string) {
  if (path === "/paths") return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
  if (path === "/labels")
    return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY", "LOG"] }];
  if (path.startsWith("/time-entries"))
    return { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
  if (path.startsWith("/notes"))
    return { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 };
  if (path.startsWith("/calendar/days")) return [];
  if (path.startsWith("/reports")) return report;
  if (path === "/logs") return [];
  throw new Error(`Unexpected ${path}`);
}

const calls = () => vi.mocked(api).mock.calls.map(([path]) => path as string);

function options(overrides: Partial<WarmupOptions> = {}): Partial<WarmupOptions> {
  return {
    delayMs: 0,
    gapMs: 0,
    storage: localStorage,
    navigator: {},
    document,
    idle: (callback) => callback(),
    flag: undefined,
    ...overrides,
  };
}

const task = (name: string, run = vi.fn(async () => undefined)) => ({
  name,
  run,
});

describe("navigation warm-up", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(today);
    vi.mocked(api).mockImplementation(async (path) => respond(path as string));
  });
  afterEach(() => vi.useRealTimers());

  it("WU-01: preloads every lazy route component once", async () => {
    const board = vi.fn(async () => ({}));
    const notes = vi.fn(async () => ({}));
    const resolved = { name: "Resolved", setup: () => null };
    const router = {
      getRoutes: () => [
        { components: { default: board } },
        { components: { default: notes } },
        { components: { default: notes } },
        { components: { default: resolved } },
        { components: undefined },
      ],
    };
    const chunks = routeChunkTasks(router as never);
    expect(chunks).toHaveLength(2);

    scheduleWarmup({ chunks, data: [] }, options());
    await vi.runAllTimersAsync();

    expect(board).toHaveBeenCalledTimes(1);
    expect(notes).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
  });

  it("WU-02: fills every page cache the pages read", async () => {
    scheduleWarmup({ chunks: [], data: pageDataTasks(today) }, options());
    await vi.runAllTimersAsync();

    expect(calls()).toEqual([
      "/paths",
      "/labels",
      "/time-entries?page=0&size=50",
      "/notes?page=0&size=20&archived=false",
      "/calendar/days?startDate=2026-09-28&endDate=2026-11-01",
      "/reports?startDate=2026-09-28&endDate=2026-10-04&aggregation=DAY",
      "/logs",
    ]);
    expect(usePathsStore().loaded).toBe(true);
    expect(useLabelsStore().loadedScopes).toEqual(
      expect.arrayContaining(["NOTE", "CALENDAR", "TIME_ENTRY", "LOG"]),
    );
    expect(useSessionsStore().cachedPage("0:50")).toBeTruthy();
    expect(useNotesStore().cachedPage("page=0&size=20&archived=false")).toBeTruthy();
    expect(useCalendarStore().loadedRanges).toContain("2026-09-28:2026-11-01");
    expect(
      useReportsStore().get("startDate=2026-09-28&endDate=2026-10-04&aggregation=DAY"),
    ).toEqual(report);
    expect(useLogsStore().loaded).toBe(true);
  });

  it("WU-02: caching a notes page leaves the visible notes list alone", async () => {
    const notes = useNotesStore();
    const visible = [{ id: "n", title: "Open", content: "", createdAt: "", updatedAt: "", version: 0, tags: [] }];
    notes.setPage(visible);

    scheduleWarmup({ chunks: [], data: pageDataTasks(today) }, options());
    await vi.runAllTimersAsync();

    expect(notes.notes).toEqual(visible);
  });

  it("WU-04: skips caches that are already loaded", async () => {
    usePathsStore().setAll([]);
    useLabelsStore().setAll([]);
    useSessionsStore().setPage("0:50", { sessions: [], page: 0, totalPages: 1, totalSessions: 0 });
    useLogsStore().setAll([]);

    scheduleWarmup({ chunks: [], data: pageDataTasks(today) }, options());
    await vi.runAllTimersAsync();

    expect(calls()).toEqual([
      "/notes?page=0&size=20&archived=false",
      "/calendar/days?startDate=2026-09-28&endDate=2026-11-01",
      "/reports?startDate=2026-09-28&endDate=2026-10-04&aggregation=DAY",
    ]);
  });

  it("WU-04: drops a warmed page when the cache was cleared meanwhile", async () => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(api).mockImplementation((path) =>
      path === "/time-entries?page=0&size=50"
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve(respond(path as string)),
    );
    scheduleWarmup({ chunks: [], data: pageDataTasks(today) }, options());
    await vi.advanceTimersByTimeAsync(0);
    useSessionsStore().clearPages();
    finish?.(respond("/time-entries"));
    await vi.runAllTimersAsync();

    expect(useSessionsStore().cachedPage("0:50")).toBeUndefined();
  });

  it("WU-05: never loads boards", async () => {
    scheduleWarmup({ chunks: [], data: pageDataTasks(today) }, options());
    await vi.runAllTimersAsync();

    expect(calls().some((path) => path.startsWith("/boards"))).toBe(false);
  });

  it("WU-06: waits for the delay and browser idle before the first request", async () => {
    const idle = vi.fn((callback: () => void) => setTimeout(callback, 500));
    const first = task("first");
    scheduleWarmup({ chunks: [], data: [first] }, options({ delayMs: 3000, idle }));

    await vi.advanceTimersByTimeAsync(2999);
    expect(idle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(first.run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(first.run).toHaveBeenCalledTimes(1);
  });

  it("WU-06: waits for a hidden tab to be shown", async () => {
    let state: DocumentVisibilityState = "hidden";
    const target = new EventTarget();
    const doc = {
      get visibilityState() {
        return state;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    const first = task("first");
    scheduleWarmup({ chunks: [], data: [first] }, options({ document: doc as never }));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.run).not.toHaveBeenCalled();
    state = "visible";
    target.dispatchEvent(new Event("visibilitychange"));
    await vi.runAllTimersAsync();
    expect(first.run).toHaveBeenCalledTimes(1);
  });

  it("WU-06: cancelling before the delay sends nothing and claims no cooldown", async () => {
    const chunk = task("chunk");
    const first = task("first");
    const { cancel } = scheduleWarmup({ chunks: [chunk], data: [first] }, options({ delayMs: 3000 }));

    await vi.advanceTimersByTimeAsync(1000);
    cancel();
    await vi.runAllTimersAsync();

    expect(chunk.run).not.toHaveBeenCalled();
    expect(first.run).not.toHaveBeenCalled();
    expect(localStorage.getItem(WARMUP_STAMP_KEY)).toBeNull();
  });

  it("WU-07: skips data warm-up inside the cooldown and warms again after it", async () => {
    const first = task("first", vi.fn(async () => {
      expect(localStorage.getItem(WARMUP_STAMP_KEY)).toBe(String(today.getTime()));
    }));
    scheduleWarmup({ chunks: [], data: [first] }, options());
    await vi.runAllTimersAsync();
    expect(first.run).toHaveBeenCalledTimes(1);

    // A reload (or another tab) inside the cooldown still preloads chunks only.
    const chunk = task("chunk");
    vi.setSystemTime(today.getTime() + WARMUP_COOLDOWN_MS - 1);
    scheduleWarmup({ chunks: [chunk], data: [first] }, options());
    await vi.runAllTimersAsync();
    expect(chunk.run).toHaveBeenCalledTimes(1);
    expect(first.run).toHaveBeenCalledTimes(1);

    vi.setSystemTime(today.getTime() + WARMUP_COOLDOWN_MS);
    scheduleWarmup({ chunks: [], data: [first] }, options());
    await vi.runAllTimersAsync();
    expect(first.run).toHaveBeenCalledTimes(2);
  });

  it("WU-07: treats an unreadable or future stamp as no cooldown", async () => {
    localStorage.setItem(WARMUP_STAMP_KEY, "garbage");
    const first = task("first");
    scheduleWarmup({ chunks: [], data: [first] }, options());
    await vi.runAllTimersAsync();
    expect(first.run).toHaveBeenCalledTimes(1);

    localStorage.setItem(WARMUP_STAMP_KEY, String(today.getTime() + 24 * 3600_000));
    scheduleWarmup({ chunks: [], data: [first] }, options());
    await vi.runAllTimersAsync();
    expect(first.run).toHaveBeenCalledTimes(2);
  });

  it("WU-08: runs one request at a time with a gap between them", async () => {
    const started: string[] = [];
    let active = 0;
    let peak = 0;
    const timed = (name: string) =>
      task(name, vi.fn(async () => {
        started.push(`${name}@${Date.now() - today.getTime()}`);
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 100));
        active--;
      }));
    scheduleWarmup(
      { chunks: [], data: [timed("a"), timed("b"), timed("c")] },
      options({ gapMs: 250 }),
    );
    await vi.runAllTimersAsync();

    expect(peak).toBe(1);
    expect(started).toEqual(["a@0", "b@350", "c@700"]);
  });

  it("WU-09: stops at the first failure without retrying", async () => {
    const failing = task("failing", vi.fn(async () => {
      throw new Error("503");
    }));
    const later = task("later");
    scheduleWarmup({ chunks: [], data: [failing, later] }, options());
    await vi.runAllTimersAsync();

    expect(failing.run).toHaveBeenCalledTimes(1);
    expect(later.run).not.toHaveBeenCalled();
    expect(localStorage.getItem(WARMUP_STAMP_KEY)).not.toBeNull();
  });

  it("WU-10: is disabled for automated browsers, Save-Data and the off switches", () => {
    expect(warmupMode(options())).toBe("on");
    expect(warmupMode(options({ navigator: { webdriver: true } }))).toBe("off");
    expect(warmupMode(options({ navigator: { connection: { saveData: true } } }))).toBe("off");
    expect(warmupMode(options({ flag: "off" }))).toBe("off");
    localStorage.setItem("know_warmup", "off");
    expect(warmupMode(options())).toBe("off");
    localStorage.setItem("know_warmup", "force");
    expect(warmupMode(options({ navigator: { webdriver: true } }))).toBe("force");
    expect(warmupMode(options({ flag: "off" }))).toBe("off");
  });

  it("WU-10: a disabled warm-up schedules nothing", async () => {
    const chunk = task("chunk");
    const first = task("first");
    scheduleWarmup(
      { chunks: [chunk], data: [first] },
      options({ navigator: { webdriver: true } }),
    );
    await vi.runAllTimersAsync();

    expect(chunk.run).not.toHaveBeenCalled();
    expect(first.run).not.toHaveBeenCalled();
  });

  it("WU-11: cancel stops the remaining tasks and aborts the running one", async () => {
    let signal: AbortSignal | undefined;
    const first: WarmupTask = {
      name: "first",
      run: vi.fn((given: AbortSignal) => {
        signal = given;
        return new Promise((resolve) => setTimeout(resolve, 100));
      }),
    };
    const later = task("later");
    const { cancel } = scheduleWarmup({ chunks: [], data: [first, later] }, options());
    await vi.advanceTimersByTimeAsync(10);
    cancel();
    await vi.runAllTimersAsync();

    expect(signal?.aborted).toBe(true);
    expect(later.run).not.toHaveBeenCalled();
  });

  it("WU-11: clearing the cooldown lets the next account warm up", () => {
    localStorage.setItem(WARMUP_STAMP_KEY, String(today.getTime()));
    clearWarmupCooldown(localStorage);
    expect(localStorage.getItem(WARMUP_STAMP_KEY)).toBeNull();
  });
});
