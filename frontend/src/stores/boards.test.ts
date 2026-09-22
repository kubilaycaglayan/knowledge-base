import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({ api: apiMock }));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("boards store concurrency", () => {
  beforeEach(() => { setActivePinia(createPinia()); apiMock.mockReset(); });

  it("does not let a stale board response replace the currently selected board", async () => {
    const firstStatuses = deferred<Array<{ id: string; name: string; position: number; archived: boolean }>>();
    const secondStatuses = deferred<Array<{ id: string; name: string; position: number; archived: boolean }>>();
    let statusCalls = 0;
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/statuses")) return ++statusCalls === 1 ? firstStatuses.promise : secondStatuses.promise;
      if (path.includes("b-status")) return Promise.resolve({ items: [{ id: "b-card", statusId: "b-status", title: "B", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [] }], nextCursor: null });
      return Promise.resolve({ items: [{ id: "a-card", statusId: "a-status", title: "A", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [] }], nextCursor: null });
    });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board-a";
    const stale = store.loadBoard();
    store.selectedId = "board-b";
    const current = store.loadBoard();
    secondStatuses.resolve([{ id: "b-status", name: "B", position: 0, archived: false }]);
    await current;
    firstStatuses.resolve([{ id: "a-status", name: "A", position: 0, archived: false }]);
    await stale;
    expect(store.selectedId).toBe("board-b");
    expect(store.cards.map((card) => card.id)).toEqual(["b-card"]);
    expect(store.statuses.map((status) => status.id)).toEqual(["b-status"]);
  });

  it("keeps a failed lazy page retryable and exposes a recoverable error", async () => {
    let pageCalls = 0;
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/statuses")) return Promise.resolve([{ id: "status", name: "Backlog", position: 0, archived: false }]);
      if (path.includes("/cards/page")) {
        pageCalls += 1;
        return pageCalls === 1
          ? Promise.resolve({ items: [], nextCursor: 19 })
          : pageCalls === 2
            ? Promise.reject(new Error("offline"))
            : Promise.resolve({ items: [{ id: "card-20", statusId: "status", title: "Recovered", body: "{}", priority: "MEDIUM", position: 20, archived: false, pathIds: [], labelIds: [] }], nextCursor: null });
      }
      return Promise.resolve([]);
    });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    await store.loadBoard();
    await expect(store.loadMore("status")).rejects.toThrow("offline");
    expect(store.pageLoading.status).toBe(false);
    expect(store.pageCursors.status).toBe(19);
    expect(store.error).toBe("Unable to load more cards. Try again.");
    await store.loadMore("status");
    expect(store.cards.map((card) => card.id)).toEqual(["card-20"]);
    expect(store.pageCursors.status).toBeNull();
    expect(store.error).toBe("");
  });

  it("reconciles a moved card in both Kanban and Gantt collections", async () => {
    apiMock.mockResolvedValue({ id: "card", statusId: "done", position: 3, title: "Shared", body: "{}", priority: "MEDIUM", archived: false, pathIds: [], labelIds: [] });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    const kanbanCard = { id: "card", statusId: "backlog", title: "Shared", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [kanbanCard];
    store.ganttCards = [{ ...kanbanCard }];
    await store.moveCard(kanbanCard, "done", 3);
    expect(store.cards[0].statusId).toBe("done");
    expect(store.ganttCards[0].statusId).toBe("done");
    expect(store.ganttCards[0].position).toBe(3);
  });

  it("persists status order and replaces the local order from the server", async () => {
    apiMock.mockResolvedValue([
      { id: "done", name: "Done", position: 0, archived: false },
      { id: "backlog", name: "Backlog", position: 1, archived: false },
    ]);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.statuses = [
      { id: "backlog", name: "Backlog", position: 0, archived: false },
      { id: "done", name: "Done", position: 1, archived: false },
    ];
    await store.reorderStatuses(["done", "backlog"]);
    expect(apiMock).toHaveBeenCalledWith("/boards/board/statuses/order", { method: "PUT", body: JSON.stringify({ ids: ["done", "backlog"] }) });
    expect(store.statuses.map((status) => status.id)).toEqual(["done", "backlog"]);
  });

  it("clears board data when the authenticated session changes", async () => {
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.boards = [{ id: "board", name: "Board", archived: false, createdAt: "", updatedAt: "" }];
    store.statuses = [{ id: "status", name: "Backlog", position: 0, archived: false }];
    store.cards = [{ id: "card", statusId: "status", title: "Secret", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }];
    store.reset();
    expect(store.selectedId).toBe("");
    expect(store.boards).toEqual([]);
    expect(store.statuses).toEqual([]);
    expect(store.cards).toEqual([]);
    expect(store.ganttCards).toEqual([]);
    expect(store.archivedCards).toEqual([]);
  });

  it("coalesces duplicate board creation requests", async () => {
    const response = { id: "new-board", name: "New board", archived: false, createdAt: "", updatedAt: "" };
    const deferredRequest = deferred<typeof response>();
    apiMock.mockImplementation((path: string) => path === "/boards" ? deferredRequest.promise : Promise.resolve([]));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    const first = store.createBoard("New board");
    const second = store.createBoard("New board");
    deferredRequest.resolve(response);
    await expect(first).resolves.toEqual(response);
    await expect(second).resolves.toBeNull();
    expect(apiMock.mock.calls.filter(([path]) => path === "/boards")).toHaveLength(1);
  });

  it("reconciles edited dates with the active Gantt window", async () => {
    const saved = { id: "card", statusId: "backlog", title: "Dated", body: "{}", priority: "MEDIUM" as const, startDate: "2026-10-01", dueDate: "2026-10-02", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    apiMock.mockResolvedValue(saved);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";
    const card = { ...saved, startDate: "2026-09-10", dueDate: "2026-09-11" };
    store.cards = [card];
    store.ganttCards = [card];

    await store.updateCard(card, { title: "Dated", body: "{}", priority: "MEDIUM", startDate: "2026-10-01", dueDate: "2026-10-02" });

    expect(store.cards[0].startDate).toBe("2026-10-01");
    expect(store.ganttCards).toEqual([]);
  });

  it("re-adds a restored dated card only when it overlaps the Gantt window", async () => {
    const restored = { id: "card", statusId: "backlog", title: "Restored", body: "{}", priority: "MEDIUM" as const, startDate: "2026-09-10", dueDate: "2026-09-12", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    apiMock.mockResolvedValue(restored);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";
    const archived = { ...restored, archived: true };
    store.archivedCards = [archived];
    store.ganttCards = [];

    await store.archiveCard(archived, true);

    expect(store.cards).toEqual([restored]);
    expect(store.ganttCards).toEqual([restored]);
  });
});
