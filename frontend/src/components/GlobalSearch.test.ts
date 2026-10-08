import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import GlobalSearch from "./GlobalSearch.vue";
import { api, ApiError } from "../lib/api";
import type { SearchGroup, SearchResponse, SearchResult } from "../lib/search";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: vi.fn(),
}));

const Page = { template: "<div>page</div>" };

const result = (overrides: Partial<SearchResult>): SearchResult => ({
  type: "NOTE",
  id: "n1",
  title: "Photo rules",
  snippet: null,
  at: "2026-09-01T09:00:00Z",
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
const group = (results: SearchResult[], total = results.length, capped = false): SearchGroup => ({
  type: results[0].type,
  total,
  capped,
  results,
});
const response = (groups: SearchGroup[], extra: Partial<SearchResponse> = {}): SearchResponse => ({
  groups,
  fuzzy: false,
  incomplete: false,
  ...extra,
});

const PHOTO = response([
  group([result({ type: "PATH", id: "p1", title: "Photography", color: "#2878D5" })]),
  group(
    [
      result({ id: "n1", title: "Photo rules", snippet: "Golden hour photo" }),
      result({ id: "n2", title: "Old photo gear", archived: true }),
    ],
    7,
  ),
  group([
    result({
      type: "LOG",
      id: "g1",
      title: "Edited shots",
      via: "LABEL",
      viaName: "Deepwork",
    }),
  ]),
]);

let router: Router;
let wrapper: VueWrapper | undefined;

async function setup(path = "/board") {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/board", component: Page },
      { path: "/paths/:id", component: Page },
      { path: "/notes", component: Page },
      { path: "/notes/:id", component: Page },
      { path: "/logs/:id", component: Page },
      { path: "/elsewhere", component: Page },
    ],
  });
  await router.push(path);
  wrapper = mount(GlobalSearch, { attachTo: document.body, global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const input = () => document.querySelector<HTMLInputElement>(".global-search-input");
const dialog = () => document.querySelector(".global-search");
const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
async function type(value: string) {
  const field = input()!;
  field.value = value;
  field.dispatchEvent(new Event("input"));
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
}
const searchCalls = () => vi.mocked(api).mock.calls.filter(([path]) => String(path).startsWith("/search"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue(PHOTO);
  localStorage.clear();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("global-search-open");
});

describe("GlobalSearch", () => {
  it.each(["metaKey", "ctrlKey"])("opens with %s+K from anywhere and focuses the field", async (modifier) => {
    await setup();
    expect(dialog()).toBeNull();
    const shortcut = press("k", { [modifier]: true });
    await flushPromises();
    expect(shortcut.defaultPrevented).toBe(true);
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(input());
    expect(document.documentElement.classList.contains("global-search-open")).toBe(true);
    // The same shortcut from the field closes it again.
    press("k", { [modifier]: true }, input()!);
    await flushPromises();
    expect(dialog()).toBeNull();
    expect(document.documentElement.classList.contains("global-search-open")).toBe(false);
  });

  it("opens from the header button, which names its shortcut", async () => {
    await setup();
    const trigger = wrapper!.get(".global-search-trigger");
    expect(trigger.attributes("aria-keyshortcuts")).toBe("Meta+K Control+K");
    await trigger.trigger("click");
    await flushPromises();
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(trigger.attributes("aria-expanded")).toBe("true");
  });

  it("waits for typing to pause before searching", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    const field = input()!;
    for (const value of ["p", "ph", "pho", "phot", "photo"]) {
      field.value = value;
      field.dispatchEvent(new Event("input"));
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(searchCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(searchCalls().map(([path]) => path)).toEqual(["/search?q=photo"]);
  });

  it("lists grouped results as links with matches marked", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    const headings = Array.from(document.querySelectorAll('[role="group"] h2')).map((heading) => heading.textContent?.replace(/\s+/g, " ").trim());
    expect(headings).toEqual(["Paths 1", "Notes 7", "Logs 1"]);
    const links = options().filter((option) => option.tagName === "A");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/paths/p1",
      "/notes/n1",
      "/notes?archived=1&q=Old+photo+gear",
      "/logs/g1",
    ]);
    expect(links[0].querySelector("mark")?.textContent).toBe("Photo");
    expect(document.body.textContent).toContain("Archived");
    expect(document.body.textContent).toContain("Label: Deepwork");
    expect(links[3].getAttribute("aria-label")).toContain("matched by Label: Deepwork");
    // Five more notes are waiting.
    expect(document.querySelector(".global-search-more")?.textContent).toContain("Show 5 more notes");
    expect(document.getElementById("global-search-status")?.textContent).toBe("9 results.");
  });

  it("moves through results with the arrow keys, wrapping at the ends", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    const field = input()!;
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-path-p1");
    press("ArrowDown", {}, field);
    await flushPromises();
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-note-n1");
    expect(document.getElementById("global-search-note-n1")?.getAttribute("aria-selected")).toBe("true");
    press("ArrowUp", {}, field);
    press("ArrowUp", {}, field);
    await flushPromises();
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-log-g1");
    press("ArrowDown", {}, field);
    await flushPromises();
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-path-p1");
  });

  it("opens the active result with Enter, closes, and remembers the search", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    press("ArrowDown", {}, input()!);
    press("Enter", {}, input()!);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/notes/n1");
    expect(dialog()).toBeNull();
    expect(JSON.parse(localStorage.getItem("know_recent_searches") || "[]")).toEqual(["photo"]);
  });

  it("opens the active result in a new tab with Ctrl+Enter and stays open", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    press("Enter", { ctrlKey: true }, input()!);
    await flushPromises();
    expect(open).toHaveBeenCalledWith("/paths/p1", "_blank", "noopener");
    expect(router.currentRoute.value.fullPath).toBe("/board");
    expect(dialog()).not.toBeNull();
  });

  it("follows a clicked result but leaves modified clicks to the browser", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    const link = document.getElementById("global-search-log-g1")!;
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(modified);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/board");
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/logs/g1");
    expect(dialog()).toBeNull();
  });

  it("closes with Escape and returns focus to where it was", async () => {
    await setup();
    const trigger = wrapper!.get(".global-search-trigger").element as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    await flushPromises();
    expect(document.activeElement).toBe(input());
    press("Escape", {}, input()!);
    await flushPromises();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the page changes underneath it", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await router.push("/elsewhere");
    await flushPromises();
    expect(dialog()).toBeNull();
  });

  it("ignores an answer that arrives after a newer search", async () => {
    let resolveSlow: (value: SearchResponse) => void = () => undefined;
    vi.mocked(api)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(response([group([result({ id: "fresh", title: "Fresh answer" })])]));
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("old");
    await type("new");
    resolveSlow(response([group([result({ id: "stale", title: "Stale answer" })])]));
    await flushPromises();
    expect(document.body.textContent).toContain("Fresh answer");
    expect(document.body.textContent).not.toContain("Stale answer");
    // The first request was cancelled when the second began.
    const firstSignal = (vi.mocked(api).mock.calls[0][1] as RequestInit).signal!;
    expect(firstSignal.aborted).toBe(true);
  });

  it("says when nothing matches", async () => {
    vi.mocked(api).mockResolvedValue(response([]));
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("zzqx");
    expect(document.querySelector(".global-search-empty")?.textContent).toContain("No results for “zzqx”");
    expect(input()!.getAttribute("aria-expanded")).toBe("false");
    expect(input()!.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("explains near-miss and incomplete results", async () => {
    vi.mocked(api).mockResolvedValue(
      response([group([result({ title: "Kubernetes" })])], { fuzzy: true, incomplete: true }),
    );
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("kubernets");
    const notices = Array.from(document.querySelectorAll(".global-search-notice")).map((notice) => notice.textContent?.trim());
    expect(notices).toEqual([
      "No exact matches for “kubernets”. Showing similar spellings.",
      "Some results took too long and are left out.",
    ]);
    expect(document.getElementById("global-search-status")?.textContent).toBe("1 result with similar spelling.");
  });

  it("reports failures and retries on request", async () => {
    vi.mocked(api).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(PHOTO);
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    const alert = document.querySelector(".global-search-error");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain("Search isn’t available right now");
    (alert!.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector(".global-search-error")).toBeNull();
    expect(options().length).toBeGreaterThan(0);
  });

  it("shows the server's reason for a rejected search", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError("Search query is too long", 400));
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("x");
    expect(document.querySelector(".global-search-error")?.textContent).toContain("Search query is too long");
  });

  it("doesn't send searches over the length limit", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("x".repeat(201));
    expect(searchCalls()).toHaveLength(0);
    expect(input()!.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector(".global-search-message")?.textContent).toContain("limited to 200 characters");
  });

  it("loads more of one type in place and keeps the keyboard on the first new result", async () => {
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    await type("photo");
    vi.mocked(api).mockResolvedValueOnce(
      response([
        group(
          [result({ id: "n2", title: "Old photo gear", archived: true }), result({ id: "n3", title: "Photo walk" }), result({ id: "n4", title: "Photo book" })],
          7,
        ),
      ]),
    );
    const field = input()!;
    // Move to the "show more" row and choose it.
    for (let step = 0; step < 10 && field.getAttribute("aria-activedescendant") !== "global-search-more-NOTE"; step++) {
      press("ArrowDown", {}, field);
      await flushPromises();
    }
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-more-NOTE");
    press("Enter", {}, field);
    await flushPromises();
    expect(searchCalls().at(-1)?.[0]).toBe("/search?q=photo&types=NOTE&limit=20&offset=2&fuzzy=false");
    const noteIds = options().filter((option) => option.id.startsWith("global-search-note-")).map((option) => option.id);
    expect(noteIds).toEqual(["global-search-note-n1", "global-search-note-n2", "global-search-note-n3", "global-search-note-n4"]);
    expect(field.getAttribute("aria-activedescendant")).toBe("global-search-note-n3");
    expect(document.querySelector(".global-search-more")?.textContent).toContain("Show 3 more notes");
  });

  it("offers recent searches when the field is empty", async () => {
    localStorage.setItem("know_recent_searches", JSON.stringify(["photo", "kubernetes"]));
    await setup();
    press("k", { ctrlKey: true });
    await flushPromises();
    expect(options().map((option) => option.textContent?.trim())).toEqual(["photo", "kubernetes"]);
    press("ArrowDown", {}, input()!);
    press("ArrowDown", {}, input()!);
    press("Enter", {}, input()!);
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(input()!.value).toBe("kubernetes");
    expect(searchCalls().at(-1)?.[0]).toBe("/search?q=kubernetes");
    await type("");
    (document.querySelector(".global-search-clear") as HTMLButtonElement).click();
    await flushPromises();
    expect(localStorage.getItem("know_recent_searches")).toBeNull();
    expect(document.querySelector(".global-search-hint")).not.toBeNull();
  });
});
