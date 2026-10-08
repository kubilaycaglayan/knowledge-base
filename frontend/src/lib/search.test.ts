import {
  forgetSearches,
  highlightParts,
  isGlobalSearchShortcut,
  isPageSearchShortcut,
  isTypingTarget,
  recentSearches,
  rememberSearch,
  searchRequest,
  searchResultLink,
  searchTerms,
  type SearchResult,
} from "./search";

const result = (overrides: Partial<SearchResult>): SearchResult => ({
  type: "NOTE",
  id: "id-1",
  title: "Title",
  snippet: null,
  at: null,
  date: null,
  archived: false,
  via: null,
  viaName: null,
  color: null,
  pathId: null,
  pathName: null,
  pathColor: null,
  boardId: null,
  boardName: null,
  statusName: null,
  endedAt: null,
  durationSeconds: null,
  ...overrides,
});

describe("searchResultLink", () => {
  it("gives every record type its own address", () => {
    expect(searchResultLink(result({ type: "PATH", id: "p" }))).toEqual({ path: "/paths/p" });
    expect(searchResultLink(result({ type: "LABEL", id: "l" }))).toEqual({ path: "/labels/l" });
    expect(searchResultLink(result({ type: "LOG", id: "g" }))).toEqual({ path: "/logs/g" });
    expect(searchResultLink(result({ type: "SESSION", id: "s" }))).toEqual({ path: "/sessions/s" });
    expect(searchResultLink(result({ type: "NOTE", id: "n" }))).toEqual({ path: "/notes/n" });
    expect(searchResultLink(result({ type: "BOARD", id: "b" }))).toEqual({ path: "/board", query: { board: "b" } });
    expect(searchResultLink(result({ type: "CARD", id: "c", boardId: "b" }))).toEqual({
      path: "/board",
      query: { board: "b", card: "c", cardBoard: "b" },
    });
    expect(searchResultLink(result({ type: "CALENDAR_DAY", id: "d", date: "2026-09-03" }))).toEqual({
      path: "/calendar",
      query: { date: "2026-09-03" },
    });
  });

  it("sends archived records to the archives that list them", () => {
    expect(searchResultLink(result({ type: "NOTE", archived: true, title: "Old plan" }))).toEqual({
      path: "/notes",
      query: { archived: "1", q: "Old plan" },
    });
    expect(searchResultLink(result({ type: "NOTE", archived: true, title: "Untitled note" }))).toEqual({
      path: "/notes",
      query: { archived: "1", q: "" },
    });
    expect(searchResultLink(result({ type: "BOARD", id: "b", archived: true }))).toEqual({
      path: "/board/archive",
      query: { archivedBoard: "b" },
    });
    expect(searchResultLink(result({ type: "CARD", id: "c", boardId: "b", archived: true }))).toEqual({
      path: "/board/archive",
      query: { board: "b", card: "c" },
    });
  });
});

describe("searchRequest", () => {
  it("encodes the query and only non-default options", () => {
    expect(searchRequest("a & b")).toBe("/search?q=a+%26+b");
    expect(searchRequest("x", { types: ["NOTE", "LOG"], limit: 20, offset: 5, fuzzy: false })).toBe(
      "/search?q=x&types=NOTE%2CLOG&limit=20&offset=5&fuzzy=false",
    );
    expect(searchRequest("x", { limit: 5, offset: 0 })).toBe("/search?q=x");
  });
});

describe("searchTerms", () => {
  it("splits on whitespace, drops repeats, and stops at eight terms", () => {
    expect(searchTerms("  Alpha\tbeta  ALPHA ")).toEqual(["Alpha", "beta"]);
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("1 2 3 4 5 6 7 8 9")).toHaveLength(8);
  });
});

describe("highlightParts", () => {
  it("marks every case-insensitive occurrence", () => {
    expect(highlightParts("Photo of a photographer", ["photo"])).toEqual([
      { text: "Photo", match: true },
      { text: " of a ", match: false },
      { text: "photo", match: true },
      { text: "grapher", match: false },
    ]);
  });

  it("merges overlapping and adjacent terms", () => {
    expect(highlightParts("abcdef", ["abc", "cde"])).toEqual([
      { text: "abcde", match: true },
      { text: "f", match: false },
    ]);
  });

  it("returns plain text when nothing matches or lowercasing changes the length", () => {
    expect(highlightParts("Kubernetes", ["kubernets"])).toEqual([{ text: "Kubernetes", match: false }]);
    expect(highlightParts("İstanbul", ["istanbul"])).toEqual([{ text: "İstanbul", match: false }]);
    expect(highlightParts("", ["x"])).toEqual([]);
    expect(highlightParts("text", [])).toEqual([{ text: "text", match: false }]);
  });

  it("treats regex characters literally", () => {
    expect(highlightParts("cost (100%)", ["(100%)"])).toEqual([
      { text: "cost ", match: false },
      { text: "(100%)", match: true },
    ]);
  });
});

describe("recent searches", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("keeps the newest six distinct searches", () => {
    for (const query of ["one", "two", "three", "four", "five", "six", "seven"]) rememberSearch(query);
    rememberSearch("  THREE ");
    expect(recentSearches()).toEqual(["THREE", "seven", "six", "five", "four", "two"]);
    rememberSearch("   ");
    expect(recentSearches()).toHaveLength(6);
    forgetSearches();
    expect(recentSearches()).toEqual([]);
  });

  it("survives corrupt or unavailable storage", () => {
    localStorage.setItem("know_recent_searches", "{not json");
    expect(recentSearches()).toEqual([]);
    localStorage.setItem("know_recent_searches", JSON.stringify(["ok", 3, null]));
    expect(recentSearches()).toEqual(["ok"]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberSearch("x")).not.toThrow();
    expect(recentSearches()).toEqual([]);
  });
});

describe("shortcuts", () => {
  afterEach(() => (document.body.innerHTML = ""));

  it("recognises Cmd+K and Ctrl+K only", () => {
    expect(isGlobalSearchShortcut(new KeyboardEvent("keydown", { key: "k", metaKey: true }))).toBe(true);
    expect(isGlobalSearchShortcut(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }))).toBe(true);
    expect(isGlobalSearchShortcut(new KeyboardEvent("keydown", { key: "k" }))).toBe(false);
    expect(isGlobalSearchShortcut(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isGlobalSearchShortcut(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("knows which elements take typing", () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild as HTMLElement;
    };
    expect(isTypingTarget(make("<input>"))).toBe(true);
    expect(isTypingTarget(make('<input type="search">'))).toBe(true);
    expect(isTypingTarget(make('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(make("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(make("<select></select>"))).toBe(true);
    const editable = make('<div contenteditable="true"><p>x</p></div>');
    expect(isTypingTarget(editable.querySelector("p"))).toBe(true);
    expect(isTypingTarget(make("<button>x</button>"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("takes a bare slash outside fields and dialogs as the page search shortcut", () => {
    const slash = (init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
      const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...init });
      let seen = false;
      const listener = (value: Event) => (seen = isPageSearchShortcut(value as KeyboardEvent));
      document.addEventListener("keydown", listener);
      target.dispatchEvent(event);
      document.removeEventListener("keydown", listener);
      return seen;
    };
    expect(slash()).toBe(true);
    expect(slash({ ctrlKey: true })).toBe(false);
    expect(slash({ metaKey: true })).toBe(false);
    document.body.innerHTML = "<input>";
    expect(slash({}, document.querySelector("input")!)).toBe(false);
    document.body.innerHTML = '<div aria-modal="true"></div>';
    expect(slash()).toBe(false);
  });
});
