import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { api, ApiError } from "../lib/api";
import SessionsView from "./SessionsView.vue";
import LogsView from "./LogsView.vue";
import PathsView from "./PathsView.vue";
import LabelsView from "./LabelsView.vue";
import CalendarView from "./CalendarView.vue";
import NotesView from "./NotesView.vue";
import vuetify from "../plugins/vuetify";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: vi.fn(),
}));

type Handler = (path: string, init?: RequestInit) => unknown;
let handlers: [RegExp | string, Handler][] = [];
function respond(match: RegExp | string, handler: Handler | unknown) {
  handlers.unshift([match, typeof handler === "function" ? (handler as Handler) : () => handler]);
}
const notFound = () => {
  throw new ApiError("Not found", 404);
};

let router: Router;
let wrapper: VueWrapper | undefined;
async function open(component: object, path: string, routes: (string | [string, string])[]) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((route) =>
      typeof route === "string" ? { path: route, component } : { path: route[0], name: route[1], component },
    ),
  });
  await router.push(path);
  wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router, vuetify],
      stubs: { FloatingTimeTracker: { template: "<div></div>" } },
    },
  });
  await flushPromises();
  return wrapper;
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (value) => value.textContent?.trim() === name || value.getAttribute("aria-label") === name,
  );
const putCalls = (prefix: string) =>
  vi.mocked(api).mock.calls.filter(([path, init]) => String(path).startsWith(prefix) && init?.method === "PUT");

beforeEach(() => {
  setActivePinia(createPinia());
  handlers = [];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
    for (const [match, handler] of handlers)
      if (typeof match === "string" ? path === match : match.test(path)) return handler(path, init);
    return [];
  });
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

describe("/sessions/:id", () => {
  const session = {
    id: "s1",
    pathId: "p1",
    labelIds: ["l1"],
    startedAt: "2026-09-01T09:00:00Z",
    endedAt: "2026-09-01T10:30:00Z",
    durationSeconds: 5400,
    description: "Edited the sunset series",
    source: "MANUAL",
  };
  beforeEach(() => {
    respond(/^\/time-entries\?/, { page: 0, totalPages: 1, totalSessions: 0, sessions: [] });
    respond("/paths", [{ id: "p1", name: "Photography", status: "ACTIVE", color: "#2878D5" }]);
    respond("/labels?scope=TIME_ENTRY", [{ id: "l1", name: "Deepwork", color: "#7A4CC2", scopes: ["TIME_ENTRY"] }]);
    respond("/time-entries/s1", (_path: string, init?: RequestInit) =>
      init?.method === "PUT" ? { ...session, description: JSON.parse(String(init.body)).description } : init?.method === "DELETE" ? undefined : session,
    );
  });

  it("shows a session that isn't on the loaded page and closes back to the list", async () => {
    await open(SessionsView, "/sessions/s1", ["/", "/sessions/:id"]);
    const shown = dialog()!;
    expect(shown.getAttribute("aria-modal")).toBe("true");
    expect(shown.textContent).toContain("Edited the sunset series");
    expect(shown.textContent).toContain("Photography");
    expect(shown.textContent).toContain("Deepwork");
    expect(shown.textContent).toContain("1h 30 minutes");
    button("Edit")!.click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"] form')).not.toBeNull();
    expect(
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Edit session description"]',
      )?.value,
    ).toBe("Edited the sunset series");
    button("Close session")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(dialog()).toBeNull();
  });

  it("edits the session, refusing an end before the start", async () => {
    await open(SessionsView, "/sessions/s1", ["/", "/sessions/:id"]);
    button("Edit")!.click();
    await flushPromises();
    const end = document.querySelector<HTMLInputElement>('[aria-label="Edit session end"]')!;
    const start = document.querySelector<HTMLInputElement>('[aria-label="Edit session start"]')!;
    end.value = start.value.replace(/T\d\d/, (hour) => `T${String(Number(hour.slice(1)) - 1).padStart(2, "0")}`);
    end.dispatchEvent(new Event("input"));
    document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit();
    await flushPromises();
    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("has to end after it starts");
    expect(putCalls("/time-entries/s1")).toHaveLength(0);

    end.value = start.value.replace(/T\d\d/, (hour) => `T${String(Number(hour.slice(1)) + 2).padStart(2, "0")}`);
    end.dispatchEvent(new Event("input"));
    const description = document.querySelector<HTMLTextAreaElement>('[aria-label="Edit session description"]')!;
    description.value = "Edited and exported";
    description.dispatchEvent(new Event("input"));
    document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit();
    await flushPromises();
    expect(putCalls("/time-entries/s1")).toHaveLength(1);
    expect(dialog()!.textContent).toContain("Edited and exported");
    expect(document.querySelector('[role="dialog"] form')).toBeNull();
  });

  it("asks before discarding unsaved edits", async () => {
    await open(SessionsView, "/sessions/s1", ["/", "/sessions/:id"]);
    button("Edit")!.click();
    await flushPromises();
    const description = document.querySelector<HTMLTextAreaElement>('[aria-label="Edit session description"]')!;
    description.value = "Half typed";
    description.dispatchEvent(new Event("input"));
    await flushPromises();
    button("Close session")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/sessions/s1");
    expect(dialog()!.textContent).toContain("Discard your unsaved changes?");
    button("Discard")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("removes the session after confirmation", async () => {
    await open(SessionsView, "/sessions/s1", ["/", "/sessions/:id"]);
    button("Remove…")!.click();
    await flushPromises();
    expect(dialog()!.textContent).toContain("Remove this session?");
    button("Remove")!.click();
    await flushPromises();
    expect(vi.mocked(api).mock.calls.some(([path, init]) => path === "/time-entries/s1" && init?.method === "DELETE")).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("links each listed session's date to its own address", async () => {
    respond(/^\/time-entries\?/, { page: 0, totalPages: 1, totalSessions: 1, sessions: [session] });
    await open(SessionsView, "/", ["/", "/sessions/:id"]);
    const link = document.querySelector<HTMLAnchorElement>("a.session-date-link")!;
    expect(link.getAttribute("href")).toBe("/sessions/s1");
    link.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/sessions/s1");
    expect(dialog()!.textContent).toContain("Edited the sunset series");
  });

  it("explains a session that no longer exists", async () => {
    respond("/time-entries/gone", notFound);
    await open(SessionsView, "/sessions/gone", ["/", "/sessions/:id"]);
    expect(dialog()!.textContent).toContain("This session doesn’t exist any more");
    button("Back to sessions")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("keeps a running session read-only", async () => {
    respond("/time-entries/run", { ...session, id: "run", endedAt: undefined, durationSeconds: undefined, running: true });
    await open(SessionsView, "/sessions/run", ["/", "/sessions/:id"]);
    expect(dialog()!.textContent).toContain("Running");
    expect(button("Stop to edit")!.disabled).toBe(true);
    expect(button("Remove…")).toBeUndefined();
    expect(button("Start again")).toBeUndefined();
  });
});

describe("/logs/:id", () => {
  const log = (id: string, body: string, occurredAt: string) => ({
    id,
    body,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    version: 1,
    labelIds: [],
  });
  const many = Array.from({ length: 150 }, (_, index) =>
    log(`log-${index}`, `Thought ${index}`, new Date(Date.UTC(2026, 0, 1, 0, 150 - index)).toISOString()),
  );
  beforeEach(() => {
    respond("/logs", many);
    respond("/labels?scope=LOG", []);
  });

  it("opens a loaded log and shows it in its place in the full list", async () => {
    const scrolled = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = scrolled;
    try {
      await open(LogsView, "/logs/log-120", ["/logs", "/logs/:id"]);
      expect(dialog()!.textContent).toContain("Thought 120");
      button("Show in list")!.click();
      await flushPromises();
      expect(dialog()).toBeNull();
      expect(router.currentRoute.value.path).toBe("/logs");
      expect(router.currentRoute.value.query.page).toBe("2");
      const row = document.getElementById("log-log-120")!;
      expect(row.classList.contains("log-entry-highlight")).toBe(true);
      expect(scrolled).toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });

  it("edits the log through the shared save", async () => {
    respond("/logs/log-3", (_path: string, init?: RequestInit) =>
      init?.method === "PUT" ? { ...many[3], body: JSON.parse(String(init.body)).body, version: 2 } : many[3],
    );
    await open(LogsView, "/logs/log-3", ["/logs", "/logs/:id"]);
    button("Edit")!.click();
    await flushPromises();
    const body = document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;
    expect(document.activeElement).toBe(body);
    body.value = "   ";
    body.dispatchEvent(new Event("input"));
    document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit();
    await flushPromises();
    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("needs some text");
    body.value = "Rewritten thought";
    body.dispatchEvent(new Event("input"));
    body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    await flushPromises();
    const put = putCalls("/logs/log-3");
    expect(put).toHaveLength(1);
    expect(JSON.parse(String(put[0][1]!.body))).toMatchObject({ body: "Rewritten thought", version: 1 });
    expect(dialog()!.textContent).toContain("Rewritten thought");
    expect(document.getElementById("log-log-3")?.textContent).toContain("Rewritten thought");
  });

  it("fetches a log the list doesn't hold and explains a missing one", async () => {
    respond("/logs", []);
    respond("/logs/elsewhere", log("elsewhere", "Fetched on its own", "2026-01-01T00:00:00Z"));
    respond("/logs/gone", notFound);
    await open(LogsView, "/logs/elsewhere", ["/logs", "/logs/:id"]);
    expect(dialog()!.textContent).toContain("Fetched on its own");
    await router.push("/logs/gone");
    await flushPromises();
    expect(dialog()!.textContent).toContain("This log doesn’t exist any more");
  });

  it("links each row's time to the log's own address", async () => {
    await open(LogsView, "/logs", ["/logs", "/logs/:id"]);
    const link = document.querySelector<HTMLAnchorElement>('#log-log-7 a.log-time-link')!;
    expect(link.getAttribute("href")).toBe("/logs/log-7");
    expect(link.getAttribute("aria-label")).toMatch(/^Open log from /);
    link.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/logs/log-7");
    expect(dialog()!.textContent).toContain("Thought 7");
  });

  it("closes with Escape back to the list", async () => {
    await open(LogsView, "/logs/log-1", ["/logs", "/logs/:id"]);
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/logs");
  });
});

describe("/paths/:id", () => {
  beforeEach(() => {
    respond("/paths", [{ id: "p1", name: "Photography", description: "Light", status: "ACTIVE", color: "#2878D5" }]);
    respond("/paths/p1/summary", { path: { id: "p1", name: "Photography" }, trackedSeconds: 5400, recentActivity: [] });
  });

  it("opens the path's history and closes back to the list", async () => {
    await open(PathsView, "/paths/p1", ["/paths", "/paths/:id"]);
    const history = document.querySelector(".path-history-dialog")!;
    expect(history.textContent).toContain("Photography");
    expect(history.textContent).toContain("1h 30 minutes");
    Array.from(history.querySelectorAll("button")).find((value) => value.textContent?.trim() === "Close")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/paths");
    expect(document.querySelector(".path-history-dialog")).toBeNull();
  });

  it("gives the History button the path's address", async () => {
    await open(PathsView, "/paths", ["/paths", "/paths/:id"]);
    Array.from(document.querySelectorAll("button")).find((value) => value.textContent?.trim() === "History")!.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/paths/p1");
    expect(document.querySelector(".path-history-dialog")).not.toBeNull();
  });

  it("loads a path the list doesn't hold and explains a missing one", async () => {
    respond("/paths/older", { id: "older", name: "Older path", status: "ACTIVE" });
    respond("/paths/older/summary", { path: { id: "older", name: "Older path" }, trackedSeconds: 0, recentActivity: [] });
    respond("/paths/gone", notFound);
    await open(PathsView, "/paths/older", ["/paths", "/paths/:id"]);
    expect(document.querySelector(".path-history-dialog")?.textContent).toContain("Older path");
    await router.push("/paths/gone");
    await flushPromises();
    expect(document.querySelector(".path-history-dialog")).toBeNull();
    expect(document.body.textContent).toContain("That path doesn’t exist any more");
  });
});

describe("/labels/:id", () => {
  const HistoryStub = {
    props: ["labelId"],
    emits: ["close"],
    template: '<div class="history-stub">{{ labelId }}<button class="close-stub" @click="$emit(\'close\')">close</button></div>',
  };
  beforeEach(() => respond("/labels", [{ id: "l1", name: "Deepwork", color: null, scopes: ["NOTE"] }]));

  it("opens the label's history and keeps the list filter when it closes", async () => {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/labels", component: LabelsView },
        { path: "/labels/:id", component: LabelsView },
      ],
    });
    await router.push("/labels/l1?q=deep");
    wrapper = mount(LabelsView, {
      attachTo: document.body,
      global: { plugins: [router], stubs: { LabelHistoryDialog: HistoryStub, PromptDialog: true } },
    });
    await flushPromises();
    expect(wrapper.get(".history-stub").text()).toContain("l1");
    await wrapper.get(".close-stub").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/labels?q=deep");
    expect(wrapper.find(".history-stub").exists()).toBe(false);
    // The row's history button gives the label its address.
    await wrapper.get('[aria-label^="Show history"], [title*="istory"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/labels/l1");
  });
});

describe("/calendar?date=", () => {
  beforeEach(() => respond("/labels", []));

  it("opens the month of the linked day with its saved note and label selected", async () => {
    respond("/labels", [
      { id: "leave", name: "Sick leave", color: "#2878D5", scopes: ["CALENDAR"] },
    ]);
    respond(/^\/calendar\/days\?/, [
      {
        date: "2025-03-14",
        note: "Pi day walk",
        labels: [
          {
            labelId: "leave",
            name: "Sick leave",
            color: "#2878D5",
            portion: 0.5,
          },
        ],
      },
    ]);
    await open(CalendarView, "/calendar?date=2025-03-14", ["/calendar"]);
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("startDate=2025-02-24"))).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Pi day walk");
    expect(
      document.querySelector<HTMLInputElement>('#calendar-label-leave')?.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>(
        '[aria-label="Sick leave day portion"]',
      )?.value,
    ).toBe("0.5");
    expect(document.body.textContent).toContain("March 14, 2025");
  });

  it("follows a new date while open, and ignores impossible dates", async () => {
    respond(/^\/calendar\/days\?/, []);
    await open(CalendarView, "/calendar?date=2025-03-14", ["/calendar"]);
    await router.push("/calendar?date=2024-02-29");
    await flushPromises();
    expect(document.body.textContent).toContain("February 29, 2024");
    await router.push("/calendar?date=2025-02-30");
    await flushPromises();
    expect(document.body.textContent).toContain("February 29, 2024");
  });

  it("puts the chosen day in the address", async () => {
    respond(/^\/calendar\/days\?/, []);
    await open(CalendarView, "/calendar?date=2025-03-14", ["/calendar"]);
    const nextMonth = document.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!;
    nextMonth.click();
    await flushPromises();
    expect(router.currentRoute.value.query.date).toBe("2025-04-01");
  });

  it("moves from December into January across the year boundary", async () => {
    respond(/^\/calendar\/days\?/, []);
    await open(CalendarView, "/calendar?date=2025-12-31", ["/calendar"]);
    document.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
    await flushPromises();

    expect(router.currentRoute.value.query.date).toBe("2026-01-01");
    expect(document.body.textContent).toContain("January 1, 2026");
    expect(
      document.querySelector<HTMLSelectElement>(
        'select[aria-label="Calendar month"]',
      )?.value,
    ).toBe("0");
    expect(
      document.querySelector<HTMLSelectElement>(
        'select[aria-label="Calendar year"]',
      )?.value,
    ).toBe("2026");
  });

  it("aligns dates with Monday-first weekdays when the month starts and ends midweek", async () => {
    respond(/^\/calendar\/days\?/, []);
    await open(CalendarView, "/calendar?date=2025-03-14", ["/calendar"]);

    const weekdays = [...document.querySelectorAll(".calendar-weekday")].map(
      (element) => element.textContent?.trim(),
    );
    const days = [...document.querySelectorAll("button.calendar-day")].map(
      (button) => button.querySelector("time")?.textContent?.trim(),
    );
    expect(weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days.slice(0, 7)).toEqual(["24", "25", "26", "27", "28", "1", "2"]);
    expect(days.slice(-7)).toEqual(["31", "1", "2", "3", "4", "5", "6"]);
  });
});

describe("/notes?archived=1&q=", () => {
  it("loads the selected note when its editor URL is opened directly", async () => {
    respond(/^\/notes\?/, { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 });
    respond("/notes/labels", []);
    respond("/notes/n1", {
      id: "n1",
      title: "Direct note",
      content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loaded from its URL" }] }] }),
      contentText: "Loaded from its URL",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-02T10:00:00Z",
      version: 1,
      tags: [],
      pinned: false,
    });
    await open(NotesView, "/notes/n1", [["/notes", "notes"], ["/notes/:id", "note-editor"]]);

    expect(router.currentRoute.value.fullPath).toBe("/notes/n1");
    expect(document.querySelector<HTMLInputElement>('[aria-label="Note title"]')?.value).toBe("Direct note");
    expect(document.querySelector('[aria-label="Note content"]')?.textContent).toContain("Loaded from its URL");
  });

  it("opens the archive filtered by the linked note", async () => {
    respond(/^\/notes\?/, { items: [{ id: "n1", title: "Old gear", content: "{}", contentText: "Camera", tags: [], updatedAt: "2026-01-01T00:00:00Z", deletedAt: "2026-02-01T00:00:00Z", pinned: false }], page: 0, size: 20, totalItems: 1, totalPages: 1 });
    respond("/notes/labels", []);
    await open(NotesView, "/notes?archived=1&q=Old%20gear", [["/notes", "notes"], ["/notes/:id", "note-editor"]]);
    const request = vi.mocked(api).mock.calls.map(([path]) => String(path)).find((path) => path.startsWith("/notes?"))!;
    const params = new URLSearchParams(request.split("?")[1]);
    expect(params.get("archived")).toBe("true");
    expect(params.get("q")).toBe("Old gear");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Search notes"]')?.value).toBe("Old gear");
    expect(document.body.textContent).toContain("Restore");
    // Leaving the archive updates the address.
    Array.from(document.querySelectorAll("button")).find((value) => value.textContent?.trim() === "Active notes")!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.query.archived).toBeUndefined());
    expect(router.currentRoute.value.query.q).toBe("Old gear");
  });

  it("shows a recoverable error when a directly linked note is unavailable", async () => {
    respond(/^\/notes\?/, { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 });
    respond("/notes/labels", []);
    respond("/notes/gone", notFound);
    await open(NotesView, "/notes/gone", [["/notes", "notes"], ["/notes/:id", "note-editor"]]);

    expect(router.currentRoute.value.fullPath).toBe("/notes/gone");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Unable to open this note.");
  });
});
