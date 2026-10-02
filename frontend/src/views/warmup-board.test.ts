import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import vuetify from "../plugins/vuetify";
import { api } from "../lib/api";
import { pageDataTasks, scheduleWarmup } from "../lib/warmup";
import { useBoardsStore } from "../stores/boards";
import { usePreferencesStore } from "../stores/preferences";
import BoardView from "./BoardView.vue";

vi.mock("vue-router", () => ({ useRouter: vi.fn(), useRoute: vi.fn() }));
vi.mock("../lib/api", () => ({ api: vi.fn() }));

const today = new Date("2026-10-02T12:00:00");
const work = { id: "work", name: "Work", archived: false, createdAt: "", updatedAt: "" };
const todo = { id: "todo", boardId: "work", name: "Todo", position: 0, archived: false, cardSort: "MANUAL" };
const card = { id: "card-1", boardId: "work", statusId: "todo", title: "Warmed card", body: "{}", priority: "LOW", startDate: "2026-09-10", dueDate: "2026-09-12", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };

function respond(path: string) {
  if (path === "/boards?archived=false") return [work];
  if (path === "/boards/work/statuses") return [todo];
  if (path.startsWith("/boards/work/cards/page")) return { items: [card], nextCursor: null };
  if (path.startsWith("/boards/work/gantt")) return [card];
  if (path === "/paths") return [];
  if (path.startsWith("/labels")) return [];
  if (path.startsWith("/time-entries")) return { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
  if (path.startsWith("/notes")) return { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 };
  if (path.startsWith("/reports")) return { days: [], paths: [], calendarLabels: [] };
  return [];
}

describe("WU-12: warmed Board page", () => {
  let route: { path: string; query: Record<string, string> };
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(today);
    route = reactive({ path: "/board", query: {} });
    const navigate = vi.fn((to: { query: Record<string, string> }) => {
      route.query = to.query;
      return Promise.resolve();
    });
    vi.mocked(useRoute).mockReturnValue(route as never);
    vi.mocked(useRouter).mockReturnValue({ replace: navigate, push: navigate } as never);
    vi.mocked(api).mockImplementation(async (path) => respond(path as string));
    usePreferencesStore().board = {
      ...usePreferencesStore().board,
      boardId: "work",
      view: "gantt",
      ganttFrom: "2026-09-01",
      ganttTo: "2026-09-30",
    };
    const handle = scheduleWarmup(
      { chunks: [], data: pageDataTasks(today) },
      { delayMs: 0, gapMs: 0, idle: (callback) => callback(), navigator: {}, flag: undefined },
    );
    await handle.done;
    vi.mocked(api).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("opens the warmed board in the saved Gantt view without a board request", async () => {
    const wrapper = mount(BoardView, {
      global: {
        plugins: [vuetify],
        stubs: { RouterLink: { props: ["to"], template: "<a><slot /></a>" } },
      },
    });
    await flushPromises();

    const store = useBoardsStore();
    expect(store.selectedId).toBe("work");
    expect(route.query).toMatchObject({ board: "work", view: "gantt", from: "2026-09-01", to: "2026-09-30" });
    expect(store.cards.map((item) => item.id)).toEqual(["card-1"]);
    expect(store.ganttCards.map((item) => item.id)).toEqual(["card-1"]);
    const requests = vi.mocked(api).mock.calls
      .map(([path]) => path as string)
      .filter((path) => path.startsWith("/boards") || path.startsWith("/labels") || path === "/paths");
    expect(requests).toEqual([]);
    wrapper.unmount();
  });
});
