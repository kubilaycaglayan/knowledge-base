import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import type { Router } from "vue-router";
import { api } from "./api";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { useSessionsStore, type SessionPage } from "../stores/sessions";
import { useNotesStore, type Note } from "../stores/notes";
import { useCalendarStore, type CalendarDay } from "../stores/calendar";
import { useReportsStore } from "../stores/reports";
import { useLogsStore, type Log } from "../stores/logs";
import { useBoardsStore } from "../stores/boards";
import { usePreferencesStore } from "../stores/preferences";
import { ALL_BOARDS } from "./board-merge";
import { addCalendarDays } from "./board-gantt";

/**
 * Background warm-up of the pages a signed-in user can navigate to.
 *
 * Route chunks are preloaded on every load (static assets only). Page data is
 * fetched into the same Pinia caches the pages read, at most once per cooldown
 * across reloads and tabs, one request at a time, and only after a quiet delay,
 * so repeated reloads, dev-server reloads and test browsers cannot flood the API.
 */
export const WARMUP_STAMP_KEY = "know_warmup_at";
export const WARMUP_SWITCH_KEY = "know_warmup";
export const WARMUP_DELAY_MS = 3000;
export const WARMUP_GAP_MS = 250;
export const WARMUP_COOLDOWN_MS = 10 * 60 * 1000;

export type WarmupTask = {
  name: string;
  // Data tasks skip themselves when the cache is already filled.
  needed?: () => boolean;
  run: (signal: AbortSignal) => Promise<unknown>;
};
export type WarmupHandle = { cancel: () => void; done: Promise<void> };
type WarmupNavigator = {
  webdriver?: boolean;
  connection?: { saveData?: boolean };
};
type WarmupDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;
export type WarmupOptions = {
  delayMs: number;
  gapMs: number;
  cooldownMs: number;
  storage?: Storage;
  navigator: WarmupNavigator;
  document?: WarmupDocument;
  idle: (callback: () => void) => void;
  // Build-time switch: VITE_WARMUP=off.
  flag?: string;
};

function browserStorage() {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
function read(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(storage: Storage | undefined, key: string, value?: string) {
  try {
    if (value === undefined) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Without storage the warm-up still runs; it just cannot share a cooldown.
  }
}
function browserIdle(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window)
    window.requestIdleCallback(() => callback(), { timeout: 2000 });
  else setTimeout(callback, 0);
}
function withDefaults(overrides: Partial<WarmupOptions>): WarmupOptions {
  return {
    delayMs: WARMUP_DELAY_MS,
    gapMs: WARMUP_GAP_MS,
    cooldownMs: WARMUP_COOLDOWN_MS,
    storage: browserStorage(),
    navigator: typeof navigator === "undefined" ? {} : navigator,
    document: typeof document === "undefined" ? undefined : document,
    idle: browserIdle,
    flag: import.meta.env.VITE_WARMUP,
    ...overrides,
  };
}

export function warmupMode(
  overrides: Partial<WarmupOptions> = {},
): "off" | "on" | "force" {
  const options = withDefaults(overrides);
  if (options.flag === "off") return "off";
  const stored = read(options.storage, WARMUP_SWITCH_KEY);
  if (stored === "off") return "off";
  if (stored === "force") return "force";
  // Automated browsers reload constantly; Save-Data users asked for less traffic.
  if (options.navigator.webdriver || options.navigator.connection?.saveData)
    return "off";
  return "on";
}

export function clearWarmupCooldown(storage = browserStorage()) {
  write(storage, WARMUP_STAMP_KEY);
}

function coolingDown(options: WarmupOptions) {
  const stamp = Number(read(options.storage, WARMUP_STAMP_KEY));
  if (!Number.isFinite(stamp) || stamp <= 0) return false;
  const age = Date.now() - stamp;
  return age >= 0 && age < options.cooldownMs;
}

// Resolves when `start` calls back or the warm-up is cancelled.
function until(signal: AbortSignal, start: (resume: () => void) => void) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
    start(resolve);
  });
}

export function scheduleWarmup(
  tasks: { chunks: WarmupTask[]; data: WarmupTask[] },
  overrides: Partial<WarmupOptions> = {},
): WarmupHandle {
  const options = withDefaults(overrides);
  if (warmupMode(options) === "off")
    return { cancel: () => undefined, done: Promise.resolve() };
  const controller = new AbortController();
  const { signal } = controller;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sleep = (ms: number) =>
    until(signal, (resume) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resume();
      }, ms);
      timers.add(timer);
    });
  let onVisible: (() => void) | undefined;
  const visible = () =>
    until(signal, (resume) => {
      if (options.document?.visibilityState !== "hidden") return resume();
      onVisible = () => {
        if (options.document?.visibilityState === "hidden") return;
        options.document?.removeEventListener("visibilitychange", onVisible!);
        resume();
      };
      options.document.addEventListener("visibilitychange", onVisible);
    });

  const done = (async () => {
    await sleep(options.delayMs);
    await visible();
    await until(signal, options.idle);
    for (const task of tasks.chunks) {
      if (signal.aborted) return;
      try {
        await task.run(signal);
      } catch {
        break;
      }
    }
    if (signal.aborted || !tasks.data.length || coolingDown(options)) return;
    // Claim the cooldown first so a reload or another tab mid-run does not start again.
    write(options.storage, WARMUP_STAMP_KEY, String(Date.now()));
    for (const task of tasks.data) {
      if (signal.aborted) return;
      if (task.needed && !task.needed()) continue;
      try {
        await task.run(signal);
      } catch {
        // No retries: a struggling API should not get more traffic from warm-up.
        return;
      }
      await sleep(options.gapMs);
    }
  })();

  return {
    cancel() {
      controller.abort();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      if (onVisible)
        options.document?.removeEventListener("visibilitychange", onVisible);
    },
    done,
  };
}

const isLazyComponent = (
  component: unknown,
): component is () => Promise<unknown> =>
  typeof component === "function" &&
  !("__vccOpts" in component) &&
  !("displayName" in component) &&
  !("props" in component);

export function routeChunkTasks(router: Pick<Router, "getRoutes">): WarmupTask[] {
  const loaders = new Set<() => Promise<unknown>>();
  for (const record of router.getRoutes())
    for (const component of Object.values(record.components ?? {}))
      if (isLazyComponent(component)) loaders.add(component);
  return [...loaders].map((load, index) => ({
    name: `route chunk ${index + 1}`,
    run: () => load(),
  }));
}

type NotesPage = {
  items: Note[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
};
type ReportShape = { days?: unknown; paths?: unknown; calendarLabels?: unknown };

/**
 * Fills the caches each page reads on mount, with the keys those pages use by
 * default. Board data goes into the boards store's caches without selecting a
 * board, so the Board page still restores the saved board itself.
 */
export function pageDataTasks(today = new Date()): WarmupTask[] {
  const paths = usePathsStore();
  const labels = useLabelsStore();
  const sessions = useSessionsStore();
  const notes = useNotesStore();
  const calendar = useCalendarStore();
  const reports = useReportsStore();
  const logs = useLogsStore();
  const boards = useBoardsStore();
  const preferences = usePreferencesStore();
  const ymd = (date: Date) => format(date, "yyyy-MM-dd");

  const sessionsKey = "0:50";
  const notesKey = new URLSearchParams({
    page: "0",
    size: "20",
    archived: "false",
  }).toString();
  const monthStart = ymd(startOfWeek(startOfMonth(today), { weekStartsOn: 1 }));
  const monthEnd = ymd(endOfWeek(endOfMonth(today), { weekStartsOn: 1 }));
  const calendarRange = `${monthStart}:${monthEnd}`;
  // The board the Board page will open: the saved one, All boards when it left the tabs, none without boards.
  const boardToOpen = async () => {
    await preferences.ready();
    if (!boards.boards.length) return "";
    const saved = preferences.board.boardId;
    return boards.boards.some((board) => board.id === saved) ? saved : ALL_BOARDS;
  };
  const reportKey = new URLSearchParams({
    startDate: ymd(startOfWeek(today, { weekStartsOn: 1 })),
    endDate: ymd(endOfWeek(today, { weekStartsOn: 1 })),
    aggregation: "DAY",
  }).toString();

  return [
    {
      name: "paths",
      needed: () => !paths.loaded && !paths.loading,
      run: () => paths.load(),
    },
    {
      name: "labels",
      needed: () => !labels.loaded,
      run: () => labels.load(),
    },
    {
      name: "board list",
      needed: () => !boards.boardsLoaded,
      run: () => boards.prefetchBoards(),
    },
    {
      name: "board labels",
      needed: () => !labels.loadedScopes.includes("BOARD"),
      run: () => labels.loadScope("BOARD"),
    },
    {
      name: "board",
      async run() {
        const boardId = await boardToOpen();
        if (boardId) await boards.prefetchView(boardId);
      },
    },
    {
      name: "board timeline",
      async run() {
        const boardId = await boardToOpen();
        if (!boardId) return;
        // The Board page's Gantt window: the saved range in Gantt view, else two weeks from today.
        const saved = preferences.board;
        const savedRange = saved.view === "gantt" && saved.ganttFrom && saved.ganttTo;
        const from = savedRange ? saved.ganttFrom : ymd(today);
        const to = savedRange ? saved.ganttTo : addCalendarDays(from, 13);
        await boards.prefetchGantt(boardId, from, to);
      },
    },
    {
      name: "sessions",
      needed: () => !sessions.cachedPage(sessionsKey),
      async run(signal) {
        // A mutation clears the cache by replacing it; drop the stale page then.
        const cache = sessions.pages;
        const page = await api<SessionPage>("/time-entries?page=0&size=50", { signal });
        if (sessions.pages === cache && !signal.aborted)
          sessions.setPage(sessionsKey, page);
      },
    },
    {
      name: "notes",
      needed: () => !notes.cachedPage(notesKey),
      async run(signal) {
        const cache = notes.pages;
        const page = await api<NotesPage>(`/notes?${notesKey}`, { signal });
        if (notes.pages === cache && !signal.aborted && Array.isArray(page?.items))
          notes.cachePage(notesKey, page);
      },
    },
    {
      name: "calendar",
      needed: () => !calendar.loadedRanges.includes(calendarRange),
      async run(signal) {
        const days = calendar.days;
        const saved = await api<CalendarDay[]>(
          `/calendar/days?startDate=${monthStart}&endDate=${monthEnd}`,
          { signal },
        );
        if (calendar.days === days && !signal.aborted && Array.isArray(saved))
          calendar.setRange(calendarRange, saved);
      },
    },
    {
      name: "reports",
      needed: () => !reports.get(reportKey),
      async run(signal) {
        const cache = reports.reports;
        const report = await api<ReportShape>(`/reports?${reportKey}`, { signal });
        const valid =
          Array.isArray(report?.days) &&
          Array.isArray(report?.paths) &&
          Array.isArray(report?.calendarLabels);
        if (reports.reports === cache && !signal.aborted && valid)
          reports.set(reportKey, report);
      },
    },
    {
      name: "logs",
      needed: () => !logs.loaded,
      async run(signal) {
        const current = logs.logs;
        const items = await api<Log[]>("/logs", { signal });
        if (logs.logs === current && !signal.aborted && Array.isArray(items))
          logs.setAll(items);
      },
    },
  ];
}
