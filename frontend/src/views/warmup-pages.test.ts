import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import vuetify from "../plugins/vuetify";
import { api } from "../lib/api";
import { pageDataTasks, scheduleWarmup } from "../lib/warmup";
import SessionsView from "./SessionsView.vue";
import PathsView from "./PathsView.vue";
import LabelsView from "./LabelsView.vue";
import NotesView from "./NotesView.vue";
import CalendarView from "./CalendarView.vue";
import ReportsView from "./ReportsView.vue";
import LogsView from "./LogsView.vue";

vi.mock("vue-echarts", () => ({ default: { template: "<div />" } }));
vi.mock("../components/NotesPageSizeSelect.vue", () => ({
  default: { props: { modelValue: Number, items: Array }, template: "<span />" },
}));
vi.mock("../lib/api", () => ({ api: vi.fn() }));

function respond(path: string) {
  if (path === "/paths") return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
  if (path.startsWith("/labels"))
    return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY", "CALENDAR", "NOTE", "LOG"] }];
  if (path.startsWith("/time-entries"))
    return { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
  if (path.startsWith("/notes"))
    return { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 };
  if (path.startsWith("/calendar/days")) return [];
  if (path.startsWith("/reports")) {
    const params = new URLSearchParams(path.split("?")[1]);
    return {
      period: "WEEK",
      from: params.get("startDate"),
      to: params.get("endDate"),
      totalSeconds: 0,
      days: [],
      paths: [],
      sessionLabels: [],
      calendarLabels: [],
    };
  }
  if (path === "/logs") return [];
  return [];
}

const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/notes", name: "notes", component: NotesView },
      { path: "/notes/:id", name: "note-editor", component: NotesView },
    ],
  });

const reportStubs = {
  VChart: { template: "<div />" },
  ReportDateRange: { template: "<div />" },
};

describe("WU-02: warmed pages open without refetching", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path) => respond(path as string));
    const handle = scheduleWarmup(
      { chunks: [], data: pageDataTasks(new Date()) },
      { delayMs: 0, gapMs: 0, idle: (callback) => callback(), navigator: {}, flag: undefined },
    );
    await handle.done;
    vi.mocked(api).mockClear();
  });

  const cases: [string, () => ReturnType<typeof mount>][] = [
    ["Sessions", () => mount(SessionsView, { global: { plugins: [vuetify] } })],
    ["Paths", () => mount(PathsView)],
    ["Labels", () => mount(LabelsView, { global: { stubs: { PromptDialog: true } } })],
    [
      "Notes",
      () => {
        const r = router();
        void r.push("/notes");
        return mount(NotesView, { global: { plugins: [r, vuetify] } });
      },
    ],
    ["Calendar", () => mount(CalendarView, { global: { plugins: [vuetify] } })],
    [
      "Reports",
      () => {
        window.history.replaceState({}, "", "/reports");
        return mount(ReportsView, { global: { plugins: [vuetify], stubs: reportStubs } });
      },
    ],
  ];

  for (const [name, open] of cases)
    it(`${name} sends no request for warmed data`, async () => {
      const wrapper = open();
      await flushPromises();
      // The live timer is server-owned and never warmed.
      const data = vi.mocked(api).mock.calls
        .map(([path]) => path as string)
        .filter((path) => !path.startsWith("/timers"));
      expect(data).toEqual([]);
      wrapper.unmount();
    });

  it("WU-03: Logs shows warmed logs and refreshes them once in the background", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toContain("/logs");
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === "/logs"),
    ).toHaveLength(1);
    wrapper.unmount();
  });
});
