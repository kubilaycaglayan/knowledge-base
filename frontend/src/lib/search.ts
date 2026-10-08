import type { RouteLocationRaw } from "vue-router";

/** Record types global search covers, in the server's tie order. */
export type SearchType =
  | "PATH"
  | "BOARD"
  | "LABEL"
  | "NOTE"
  | "CARD"
  | "LOG"
  | "SESSION"
  | "CALENDAR_DAY";

export type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  snippet: string | null;
  at: string | null;
  date: string | null;
  archived: boolean;
  via: "PATH" | "LABEL" | null;
  viaName: string | null;
  color: string | null;
  pathId: string | null;
  pathName: string | null;
  pathColor: string | null;
  boardId: string | null;
  boardName: string | null;
  statusName: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
};

export type SearchGroup = {
  type: SearchType;
  total: number;
  capped: boolean;
  results: SearchResult[];
};

export type SearchResponse = {
  groups: SearchGroup[];
  fuzzy: boolean;
  incomplete: boolean;
};

export const SEARCH_MAX_LENGTH = 200;
export const SEARCH_PAGE_SIZE = 5;
export const SEARCH_MORE_SIZE = 20;

export const searchGroupLabels: Record<SearchType, string> = {
  PATH: "Paths",
  BOARD: "Boards",
  LABEL: "Labels",
  NOTE: "Notes",
  CARD: "Cards",
  LOG: "Logs",
  SESSION: "Sessions",
  CALENDAR_DAY: "Calendar days",
};

/** Builds the request path for one search, with only non-default parameters. */
export function searchRequest(
  query: string,
  options: { types?: SearchType[]; limit?: number; offset?: number; fuzzy?: boolean } = {},
) {
  const params = new URLSearchParams({ q: query });
  if (options.types?.length) params.set("types", options.types.join(","));
  if (options.limit && options.limit !== SEARCH_PAGE_SIZE) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.fuzzy !== undefined) params.set("fuzzy", String(options.fuzzy));
  return `/search?${params}`;
}

/**
 * Where a result opens. Every record type has its own address, so results are
 * ordinary links that open in place, in a new tab, or get shared.
 */
export function searchResultLink(result: SearchResult): RouteLocationRaw {
  switch (result.type) {
    case "PATH":
      return { path: `/paths/${result.id}` };
    case "LABEL":
      return { path: `/labels/${result.id}` };
    case "LOG":
      return { path: `/logs/${result.id}` };
    case "SESSION":
      return { path: `/sessions/${result.id}` };
    case "CALENDAR_DAY":
      return { path: "/calendar", query: { date: result.date || "" } };
    case "NOTE":
      // Archived notes don't open in the editor; the archive lists them.
      return result.archived
        ? { path: "/notes", query: { archived: "1", q: result.title === "Untitled note" ? "" : result.title } }
        : { path: `/notes/${result.id}` };
    case "BOARD":
      return result.archived
        ? { path: "/board/archive", query: { archivedBoard: result.id } }
        : { path: "/board", query: { board: result.id } };
    case "CARD": {
      const boardId = result.boardId || "";
      if (!result.archived) return { path: "/board", query: { board: boardId, card: result.id, cardBoard: boardId } };
      return { path: "/board/archive", query: { board: boardId, card: result.id } };
    }
  }
}

export type AppPage = { id: string; label: string; path: string; aliases?: string[] };

/** The app's main pages, which global search jumps to by name. */
export const appPages: AppPage[] = [
  { id: "sessions", label: "Sessions", path: "/", aliases: ["home", "timer"] },
  { id: "board", label: "Board", path: "/board", aliases: ["kanban"] },
  { id: "board-archive", label: "Board archive", path: "/board/archive" },
  { id: "logs", label: "Logs", path: "/logs" },
  { id: "notes", label: "Notes", path: "/notes" },
  { id: "calendar", label: "Calendar", path: "/calendar" },
  { id: "reports", label: "Reports", path: "/reports" },
  { id: "timeline", label: "Timeline", path: "/timeline" },
  { id: "paths", label: "Paths", path: "/paths" },
  { id: "labels", label: "Labels", path: "/labels" },
  { id: "imports", label: "Imports", path: "/imports" },
  { id: "development", label: "Development", path: "/development" },
  { id: "settings", label: "Settings", path: "/settings", aliases: ["preferences"] },
];

/**
 * Pages whose name (or alias) has a word starting with every typed term.
 * An exact name comes first, then names that start with the query, then the rest.
 */
export function matchPages(query: string, pages: AppPage[] = appPages): AppPage[] {
  const terms = searchTerms(query).map((term) => term.toLocaleLowerCase());
  if (!terms.length) return [];
  const whole = terms.join(" ");
  const ranked: { page: AppPage; rank: number }[] = [];
  for (const page of pages) {
    const names = [page.label, ...(page.aliases || [])].map((name) => name.toLocaleLowerCase());
    const words = names.flatMap((name) => name.split(/\s+/));
    if (!terms.every((term) => words.some((word) => word.startsWith(term)))) continue;
    const rank = names.includes(whole) ? 0 : names.some((name) => name.startsWith(whole)) ? 1 : 2;
    ranked.push({ page, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map(({ page }) => page);
}

/** Splits a query into the terms the server matches: distinct, whitespace separated. */
export function searchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of query.trim().split(/\s+/)) {
    if (!term) continue;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === 8) break;
  }
  return terms;
}

export type TextPart = { text: string; match: boolean };

/**
 * Cuts text into parts so every case-insensitive occurrence of a term can be
 * marked. Longer terms win where matches overlap. Near-miss and path/label
 * matches have no literal occurrence and come back as one plain part.
 */
export function highlightParts(text: string, terms: string[]): TextPart[] {
  if (!text) return [];
  const lower = text.toLocaleLowerCase();
  // toLocaleLowerCase can change the length (e.g. "İ"); then offsets no longer line up.
  if (lower.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  const sorted = [...terms].map((term) => term.toLocaleLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at < 0) break;
      for (let i = at; i < at + term.length; i++) marks[i] = true;
      from = at + term.length;
    }
  }
  const parts: TextPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1);
    if (last && last.match === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], match: marks[i] });
  }
  return parts;
}

const RECENT_KEY = "know_recent_searches";
const RECENT_LIMIT = 6;

/** This browser's recent searches, newest first. Storage may be unavailable. */
export function recentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return recentSearches();
  const next = [trimmed, ...recentSearches().filter((value) => value.toLocaleLowerCase() !== trimmed.toLocaleLowerCase())].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage just don't remember.
  }
  return next;
}

export function forgetSearches() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing stored.
  }
}

/** True when a key press is aimed at something the user is typing into. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement)
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(target.type);
  return false;
}

/**
 * The "/" shortcut a page uses to focus its own filter: a bare slash typed
 * outside any text field while no dialog is open.
 */
export function isPageSearchShortcut(event: KeyboardEvent) {
  return (
    event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !isTypingTarget(event.target) &&
    !document.querySelector('[aria-modal="true"]')
  );
}

/** True for ⌘K on Apple platforms and Ctrl+K elsewhere (either is accepted). */
export function isGlobalSearchShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}

export function shortcutLabel() {
  const platform =
    (typeof navigator !== "undefined" &&
      ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform)) ||
    "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘ K" : "Ctrl K";
}
