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

  it("does not let a stale board-list response replace a newer response", async () => {
    const first = deferred<Array<{ id: string; name: string; archived: boolean; createdAt: string; updatedAt: string }>>();
    const second = deferred<Awaited<typeof first.promise>>();
    let calls = 0;
    apiMock.mockImplementation(() => ++calls === 1 ? first.promise : second.promise);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();

    const stale = store.loadBoards();
    const current = store.loadBoards();
    second.resolve([{ id: "board-b", name: "Current", archived: false, createdAt: "", updatedAt: "" }]);
    await current;
    first.resolve([{ id: "board-a", name: "Stale", archived: false, createdAt: "", updatedAt: "" }]);
    await stale;

    expect(store.boards.map((board) => board.id)).toEqual(["board-b"]);
    expect(store.selectedId).toBe("board-b");
  });

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

  it("clears the previous board cards before the next board finishes loading", async () => {
    const statuses = deferred<Array<{ id: string; name: string; position: number; archived: boolean }>>();
    apiMock.mockImplementation((path: string) => path.endsWith("/statuses") ? statuses.promise : Promise.resolve({ items: [], nextCursor: null }));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "next-board";
    store.statuses = [{ id: "old-status", name: "Old", position: 0, archived: false }];
    store.cards = [{ id: "old-card", statusId: "old-status", title: "Old board", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }];

    const loading = store.loadBoard();

    expect(store.statuses).toEqual([]);
    expect(store.cards).toEqual([]);
    statuses.resolve([]);
    await loading;
  });

  // CS-04
  it("saves a column's sort and reloads only that column from its first page", async () => {
    const card = (id: string, statusId: string, priority: string, position: number) => ({ id, statusId, title: id, body: "{}", priority, position, archived: false, pathIds: [], labelIds: [] });
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path.endsWith("/statuses")) return Promise.resolve([{ id: "backlog", name: "Backlog", position: 0, archived: false, cardSort: "MANUAL" }, { id: "done", name: "Done", position: 1, archived: false, cardSort: "MANUAL" }]);
      if (path.endsWith("/statuses/backlog/sort")) return Promise.resolve({ id: "backlog", name: "Backlog", position: 0, archived: false, cardSort: JSON.parse(String(options?.body)).cardSort });
      if (path.includes("statusId=backlog")) return Promise.resolve({ items: [card("low", "backlog", "LOW", 0), card("urgent", "backlog", "URGENT", 1)], nextCursor: 19 });
      if (path.includes("statusId=done")) return Promise.resolve({ items: [card("shipped", "done", "LOW", 0)], nextCursor: null });
      return Promise.resolve([]);
    });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    await store.loadBoard();
    apiMock.mockClear();

    await store.setStatusSort(store.statuses[0], "PRIORITY");
    expect(apiMock).toHaveBeenCalledWith("/boards/board/statuses/backlog/sort", expect.objectContaining({ method: "PUT", body: JSON.stringify({ cardSort: "PRIORITY" }) }));
    expect(apiMock).toHaveBeenCalledWith("/boards/board/cards/page?statusId=backlog&cursor=-1&limit=20");
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining("statusId=done"));
    expect(store.statuses[0].cardSort).toBe("PRIORITY");
    expect(store.cards.map((item) => item.id).sort()).toEqual(["low", "shipped", "urgent"]);
    expect(store.pageCursors.backlog).toBe(19);
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
    await store.retryLoadMore("status");
    expect(store.cards.map((card) => card.id)).toEqual(["card-20"]);
    expect(store.pageCursors.status).toBeNull();
    expect(store.error).toBe("");
  });

  it("coalesces duplicate lazy-page requests at the same cursor", async () => {
    const pending = deferred<{ items: Array<{ id: string; statusId: string; title: string; body: string; priority: "MEDIUM"; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string }>; nextCursor: number | null }>();
    apiMock.mockImplementation((path: string) => path.includes("/cards/page") ? pending.promise : Promise.resolve([]));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.pageCursors.backlog = 20;
    const first = store.loadMore("backlog");
    const second = store.loadMore("backlog");

    expect(apiMock.mock.calls.filter(([path]) => path.includes("/cards/page"))).toHaveLength(1);
    pending.resolve({ items: [{ id: "page-21", statusId: "backlog", title: "Page 21", body: "{}", priority: "MEDIUM", position: 21, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }], nextCursor: null });
    await Promise.all([first, second]);

    expect(store.cards.map((card) => card.id)).toEqual(["page-21"]);
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

  it("rejects archived or unknown move destinations before mutating the card", async () => {
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.statuses = [
      { id: "backlog", name: "Backlog", position: 0, archived: false },
      { id: "archived", name: "Archived", position: 1, archived: true },
    ];
    const card = { id: "card", statusId: "backlog", title: "Safe", body: "{}", priority: "MEDIUM" as const, position: 2, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [card];

    await expect(store.moveCard(card, "archived", 0)).rejects.toThrow("Invalid card destination");
    await expect(store.moveCard(card, "missing", 0)).rejects.toThrow("Invalid card destination");
    await expect(store.moveCard(card, "backlog", -1)).rejects.toThrow("Invalid card destination");

    expect(card.statusId).toBe("backlog");
    expect(card.position).toBe(2);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("reorders neighboring cards when moving within the same status", async () => {
    apiMock.mockResolvedValue({ id: "first", statusId: "backlog", position: 1, title: "First", body: "{}", priority: "MEDIUM", archived: false, pathIds: [], labelIds: [] });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.statuses = [{ id: "backlog", name: "Backlog", position: 0, archived: false }];
    const first = { id: "first", statusId: "backlog", title: "First", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    const second = { id: "second", statusId: "backlog", title: "Second", body: "{}", priority: "MEDIUM" as const, position: 1, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [first, second];

    await store.moveCard(first, "backlog", 1);

    expect(store.cards.slice().sort((a, b) => a.position - b.position).map((card) => card.id)).toEqual(["second", "first"]);
    expect(second.position).toBe(0);
    expect(first.position).toBe(1);
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

  it("keeps a status active when archive fails", async () => {
    apiMock.mockRejectedValue({ status: 409 });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    const status = { id: "backlog", name: "Backlog", position: 0, archived: false };
    store.statuses = [status];

    await expect(store.archiveStatus(status)).rejects.toMatchObject({ status: 409 });

    expect(status.archived).toBe(false);
  });

  it("includes archived statuses when persisting an active-status reorder", async () => {
    apiMock.mockResolvedValue([
      { id: "done", name: "Done", position: 0, archived: false },
      { id: "backlog", name: "Backlog", position: 1, archived: false },
      { id: "archived", name: "Archived", position: 2, archived: true },
    ]);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.statuses = [
      { id: "backlog", name: "Backlog", position: 0, archived: false },
      { id: "done", name: "Done", position: 1, archived: false },
      { id: "archived", name: "Archived", position: 2, archived: true },
    ];

    await store.reorderStatuses(["done", "backlog"]);

    expect(apiMock).toHaveBeenCalledWith("/boards/board/statuses/order", { method: "PUT", body: JSON.stringify({ ids: ["done", "backlog", "archived"] }) });
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

  it("coalesces duplicate board archive requests", async () => {
    const response = deferred<{ id: string; name: string; archived: boolean; createdAt: string; updatedAt: string }>();
    apiMock.mockImplementation((path: string) => path === "/boards/board/archive" ? response.promise : path.endsWith("/statuses") ? Promise.resolve([]) : Promise.resolve({ items: [], nextCursor: null }));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.boards = [{ id: "board", name: "Board", archived: false, createdAt: "", updatedAt: "" }];
    const first = store.archiveBoard("board");
    const second = store.archiveBoard("board");

    expect(apiMock.mock.calls.filter(([path]) => path === "/boards/board/archive")).toHaveLength(1);
    response.resolve({ id: "board", name: "Board", archived: true, createdAt: "", updatedAt: "" });
    await expect(first).resolves.toMatchObject({ archived: true });
    await expect(second).resolves.toBeNull();
  });

  it("updates the selected board name without replacing its cards", async () => {
    const board = { id: "board", name: "Before", archived: false, createdAt: "", updatedAt: "" };
    apiMock.mockResolvedValue({ ...board, name: "After" });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = board.id;
    store.boards = [board];
    store.cards = [{ id: "card", statusId: "status", title: "Retained", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }];

    await store.updateBoard(board.id, "After");

    expect(apiMock).toHaveBeenCalledWith("/boards/board", { method: "PUT", body: JSON.stringify({ name: "After" }) });
    expect(store.boards[0].name).toBe("After");
    expect(store.cards[0].title).toBe("Retained");
  });

  it("clears the archived board cards before loading the replacement board", async () => {
    const archived = { id: "board-a", name: "Archived", archived: true, createdAt: "", updatedAt: "" };
    const replacement = { id: "board-b", name: "Replacement", archived: false, createdAt: "", updatedAt: "" };
    apiMock.mockImplementation((path: string) => {
      if (path === "/boards/board-a/archive") return Promise.resolve(archived);
      if (path === "/boards/board-b/statuses") return Promise.resolve([]);
      if (path.includes("/cards/page")) return Promise.resolve({ items: [], nextCursor: null });
      return Promise.resolve(replacement);
    });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.boards = [
      { id: "board-a", name: "Archived", archived: false, createdAt: "", updatedAt: "" },
      replacement,
    ];
    store.selectedId = "board-a";
    store.statuses = [{ id: "status", name: "Backlog", position: 0, archived: false }];
    store.cards = [{ id: "old-card", statusId: "status", title: "Old", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }];

    await store.archiveBoard("board-a");

    expect(store.selectedId).toBe("board-b");
    expect(store.cards).toEqual([]);
    expect(store.statuses).toEqual([]);
  });

  it("selects and loads a restored board when no board is active", async () => {
    const restored = { id: "restored", name: "Restored", archived: false, createdAt: "", updatedAt: "" };
    apiMock.mockImplementation((path: string) => {
      if (path === "/boards/restored/restore") return Promise.resolve(restored);
      if (path === "/boards/restored/statuses") return Promise.resolve([]);
      if (path.includes("/cards/page")) return Promise.resolve({ items: [], nextCursor: null });
      return Promise.resolve([]);
    });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();

    await store.archiveBoard("restored", true);

    expect(store.selectedId).toBe("restored");
    expect(store.boards[0].name).toBe("Restored");
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

  it("adds a newly created dated card to the active Gantt window", async () => {
    const created = { id: "created", statusId: "backlog", title: "Created", body: "{}", priority: "MEDIUM" as const, startDate: "2026-09-10", dueDate: "2026-09-12", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    apiMock.mockResolvedValue(created);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";

    await store.createCard({ title: created.title, body: created.body, priority: created.priority, startDate: created.startDate, dueDate: created.dueDate });

    expect(store.cards).toEqual([created]);
    expect(store.ganttCards).toEqual([created]);
  });

  it("removes an archived card from the active Gantt window", async () => {
    const active = { id: "card", statusId: "backlog", title: "Archived", body: "{}", priority: "MEDIUM" as const, startDate: "2026-09-10", dueDate: "2026-09-12", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    apiMock.mockResolvedValue({ ...active, archived: true });
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.cards = [active];
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";
    store.ganttCards = [active];

    await store.archiveCard(active);

    expect(store.cards).toEqual([]);
    expect(store.ganttCards).toEqual([]);
  });

  it("clears the previous board timeline while the next board loads", async () => {
    apiMock.mockImplementation((path: string) => path.endsWith("/statuses")
      ? Promise.resolve([{ id: "next-status", name: "Backlog", position: 0, archived: false }])
      : Promise.resolve({ items: [], nextCursor: null }));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "next-board";
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";
    store.ganttCards = [{ id: "old-card", statusId: "old-status", title: "Old board", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }];

    await store.loadBoard();

    expect(store.ganttCards).toEqual([]);
    expect(store.ganttFrom).toBe("");
    expect(store.ganttTo).toBe("");
  });

  it("ignores a stale Gantt response after the board changes", async () => {
    const oldTimeline = deferred<Array<{ id: string; statusId: string; title: string; body: string; priority: "MEDIUM"; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string }>>();
    const currentTimeline = deferred<Awaited<typeof oldTimeline.promise>>();
    apiMock.mockImplementation((path: string) => path.includes("board-a/gantt") ? oldTimeline.promise : currentTimeline.promise);
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board-a";
    const stale = store.loadGantt("2026-09-01", "2026-09-14");
    store.selectedId = "board-b";
    const current = store.loadGantt("2026-09-01", "2026-09-14");
    currentTimeline.resolve([{ id: "current", statusId: "status", title: "Current", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }]);
    await current;
    oldTimeline.resolve([{ id: "old", statusId: "status", title: "Old", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }]);
    await stale;
    expect(store.ganttCards.map((card) => card.id)).toEqual(["current"]);
  });

  it("surfaces a recoverable Gantt loading error", async () => {
    apiMock.mockRejectedValue(new Error("offline"));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";

    await store.loadGantt("2026-09-01", "2026-09-14");

    expect(store.error).toBe("Unable to load the timeline. Try again.");
    expect(store.ganttCards).toEqual([]);
  });

  it("keeps the newest rapid card move when responses arrive out of order", async () => {
    const firstMove = deferred<{ id: string; statusId: string; title: string; body: string; priority: "MEDIUM"; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string }>();
    const secondMove = deferred<Awaited<typeof firstMove.promise>>();
    let moveCalls = 0;
    apiMock.mockImplementation((path: string) => path.includes("/move") ? (++moveCalls === 1 ? firstMove.promise : secondMove.promise) : Promise.resolve([]));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    const card = { id: "card", statusId: "backlog", title: "Rapid", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [card];
    store.ganttCards = [{ ...card }];
    const first = store.moveCard(card, "pending", 0);
    const second = store.moveCard(card, "done", 0);
    secondMove.resolve({ ...card, statusId: "done", position: 0 });
    await second;
    firstMove.resolve({ ...card, statusId: "pending", position: 0 });
    await first;

    expect(store.cards[0].statusId).toBe("done");
    expect(store.ganttCards[0].statusId).toBe("done");
  });

  it("keeps the newest card edit when save responses arrive out of order", async () => {
    const firstUpdate = deferred<{ id: string; statusId: string; title: string; body: string; priority: "MEDIUM"; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string }>();
    const secondUpdate = deferred<Awaited<typeof firstUpdate.promise>>();
    let updateCalls = 0;
    apiMock.mockImplementation((path: string) => path.includes("/cards/card") ? (++updateCalls === 1 ? firstUpdate.promise : secondUpdate.promise) : Promise.resolve([]));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.ganttFrom = "2026-09-01";
    store.ganttTo = "2026-09-30";
    const card = { id: "card", statusId: "backlog", title: "Original", body: "{}", priority: "MEDIUM" as const, startDate: "2026-09-10", dueDate: "2026-09-10", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [card];
    store.ganttCards = [{ ...card }];
    const first = store.updateCard(card, { title: "Older", body: "{}", priority: "MEDIUM", startDate: card.startDate, dueDate: card.dueDate });
    const second = store.updateCard(card, { title: "Newest", body: "{}", priority: "MEDIUM", startDate: card.startDate, dueDate: card.dueDate });
    secondUpdate.resolve({ ...card, title: "Newest" });
    await second;
    firstUpdate.resolve({ ...card, title: "Older" });
    await first;

    expect(store.cards[0].title).toBe("Newest");
    expect(store.ganttCards[0].title).toBe("Newest");
  });

  it("refreshes the card after a conflict so a deliberate retry uses the latest timestamp", async () => {
    const card = { id: "card", statusId: "backlog", title: "Draft", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "old" };
    const latest = { ...card, title: "Changed in another tab", updatedAt: "new" };
    let calls = 0;
    apiMock.mockImplementation(() => calls++ === 0 ? Promise.reject({ status: 409 }) : Promise.resolve(latest));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    store.cards = [card];

    await expect(store.updateCard(card, { title: "Draft edit", body: "{}", priority: "MEDIUM" })).rejects.toMatchObject({ status: 409 });

    expect(card.title).toBe("Changed in another tab");
    expect(card.updatedAt).toBe("new");
  });

  it("keeps the current card intact when an edit times out", async () => {
    apiMock.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board";
    const card = { id: "card", statusId: "backlog", title: "Still here", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    store.cards = [card];

    await expect(store.updateCard(card, { title: "Timed out", body: "{}", priority: "MEDIUM" })).rejects.toMatchObject({ name: "AbortError" });

    expect(store.cards).toEqual([card]);
    expect(card.title).toBe("Still here");
  });

  it("does not append a lazy page after the board changes", async () => {
    const pendingPage = deferred<{ items: Array<{ id: string; statusId: string; title: string; body: string; priority: "MEDIUM"; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string }>; nextCursor: number | null }>();
    apiMock.mockImplementation((path: string) => path.includes("/cards/page") ? pendingPage.promise : Promise.resolve([]));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board-a";
    store.pageCursors.backlog = 20;
    const stale = store.loadMore("backlog");
    store.selectedId = "board-b";
    store.boardLoadRevision += 1;
    pendingPage.resolve({ items: [{ id: "old-page", statusId: "backlog", title: "Old", body: "{}", priority: "MEDIUM", position: 21, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" }], nextCursor: null });
    await stale;

    expect(store.cards).toEqual([]);
    expect(store.error).toBe("");
    expect(store.pageLoading.backlog).toBe(false);
  });

  it("clears a previous board page error before loading the next board", async () => {
    apiMock.mockImplementation((path: string) => path.endsWith("/statuses")
      ? Promise.resolve([{ id: "backlog", name: "Backlog", position: 0, archived: false }])
      : Promise.resolve({ items: [], nextCursor: null }));
    const { useBoardsStore } = await import("./boards");
    const store = useBoardsStore();
    store.selectedId = "board-b";
    store.pageErrors.backlog = "Unable to load more cards. Try again.";

    await store.loadBoard();

    expect(store.pageErrors).toEqual({});
  });

  describe("board ordering (PB-17, PB-18, PB-24, PB-32)", () => {
    const board = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, archived: false, createdAt: "", updatedAt: "", pathId: null, hidden: false, pinned: false, ...extra });

    it("pins a custom board and reloads the server tab order", async () => {
      apiMock.mockImplementation((path: string) => path.endsWith("/pin") ? Promise.resolve(board("c2", { pinned: true })) : Promise.resolve([board("c2", { pinned: true }), board("c1")]));
      const { useBoardsStore } = await import("./boards");
      const store = useBoardsStore();
      store.boards = [board("c1"), board("c2")] as any;
      store.selectedId = "c1";

      await store.pinBoard("c2", true);

      expect(apiMock).toHaveBeenCalledWith("/boards/c2/pin", expect.objectContaining({ method: "POST", body: JSON.stringify({ pinned: true }) }));
      expect(store.boards.map((item) => item.id)).toEqual(["c2", "c1"]);
      expect(store.selectedId).toBe("c1");
    });

    it("reorderBoards interleaves path and custom boards within a group and persists it", async () => {
      apiMock.mockResolvedValue(undefined);
      const { useBoardsStore } = await import("./boards");
      const store = useBoardsStore();
      store.boards = [board("pinned", { pinned: true }), board("p1", { pathId: "path-1" }), board("p2", { pathId: "path-2" }), board("c1")] as any;

      await store.reorderBoards(["p1", "c1", "p2"]);

      expect(apiMock).toHaveBeenCalledWith("/boards/order", expect.objectContaining({ method: "PUT", body: JSON.stringify({ ids: ["p1", "c1", "p2"] }) }));
      expect(store.boards.map((item) => item.id)).toEqual(["pinned", "p1", "c1", "p2"]);
    });

    it("reorderBoards rolls back when the server rejects the order", async () => {
      apiMock.mockRejectedValue(new Error("nope"));
      const { useBoardsStore } = await import("./boards");
      const store = useBoardsStore();
      store.boards = [board("p1", { pathId: "path-1" }), board("c1"), board("c2")] as any;

      await expect(store.reorderBoards(["c2", "c1"])).rejects.toThrow();

      expect(store.boards.map((item) => item.id)).toEqual(["p1", "c1", "c2"]);
    });
  });
});

describe("All boards view and cached views (AB-19, AB-20)", () => {
  beforeEach(() => { setActivePinia(createPinia()); apiMock.mockReset(); });

  const card = (id: string, boardId: string, statusId: string, extra: Record<string, unknown> = {}) => ({ id, boardId, statusId, title: id, body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "u1", ...extra });
  const status = (id: string, boardId: string, name: string, position = 0) => ({ id, boardId, name, position, archived: false, cardSort: "MANUAL" });
  const boardA = [status("a-todo", "a", "To Do"), status("a-done", "a", "Done", 1)];
  const boardB = [status("b-todo", "b", "To do", 0)];

  function serve(routes: Record<string, unknown> = {}) {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      // A route matches its exact path; a route with a query matches by prefix.
      for (const [prefix, value] of Object.entries(routes)) if (path === prefix || path.startsWith(prefix.includes("?") ? prefix : `${prefix}?`)) return Promise.resolve(typeof value === "function" ? (value as (p: string, o?: RequestInit) => unknown)(path, options) : value);
      if (path === "/boards?archived=false") return Promise.resolve([{ id: "a", name: "A", archived: false, createdAt: "", updatedAt: "" }, { id: "b", name: "B", archived: false, createdAt: "", updatedAt: "" }]);
      if (path === "/boards/a/statuses") return Promise.resolve(boardA);
      if (path === "/boards/b/statuses") return Promise.resolve(boardB);
      if (path.startsWith("/boards/a/cards/page?statusId=a-todo")) return Promise.resolve({ items: [card("c1", "a", "a-todo")], nextCursor: null });
      if (path.startsWith("/boards/a/cards/page")) return Promise.resolve({ items: [], nextCursor: null });
      if (path.startsWith("/boards/b/cards/page")) return Promise.resolve({ items: [card("c2", "b", "b-todo")], nextCursor: null });
      if (path === "/boards/all/columns") return Promise.resolve([{ name: "To Do", cardSort: "MANUAL", statuses: [boardA[0], boardB[0]] }, { name: "Done", cardSort: "PRIORITY", statuses: [boardA[1]] }]);
      if (path.startsWith("/boards/all/columns/cards/page?name=To%20Do")) return Promise.resolve({ items: [card("c1", "a", "a-todo"), card("c2", "b", "b-todo")], nextCursor: 1 });
      if (path.startsWith("/boards/all/columns/cards/page")) return Promise.resolve({ items: [], nextCursor: null });
      return Promise.resolve([]);
    });
  }

  async function storeWith() {
    const { useBoardsStore } = await import("./boards");
    return useBoardsStore();
  }

  it("serves a loaded view from the cache", async () => {
    serve();
    const store = await storeWith();
    await store.loadBoards();
    await store.loadBoards();
    expect(apiMock.mock.calls.filter(([path]) => path === "/boards?archived=false")).toHaveLength(1);

    store.selectedId = "a"; await store.loadBoard();
    store.selectedId = "b"; await store.loadBoard();
    store.selectedId = "all"; await store.loadBoard();
    const calls = apiMock.mock.calls.length;
    store.selectedId = "a"; await store.loadBoard();
    expect(store.cards.map((item) => item.id)).toEqual(["c1"]);
    expect(store.statuses.map((item) => item.id)).toEqual(["a-todo", "a-done"]);
    store.selectedId = "all"; await store.loadBoard();
    expect(store.cards.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(store.pageCursors["column:to do"]).toBe(1);
    store.selectedId = "b"; await store.loadBoard();
    expect(store.cards.map((item) => item.id)).toEqual(["c2"]);
    expect(apiMock.mock.calls.length).toBe(calls);

    await store.loadBoard(true);
    expect(apiMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("loads merged columns for the All boards view", async () => {
    serve();
    const store = await storeWith();
    store.selectedId = "all";
    await store.loadBoard();
    expect(apiMock).toHaveBeenCalledWith("/boards/all/columns");
    expect(apiMock).toHaveBeenCalledWith("/boards/all/columns/cards/page?name=To%20Do&cursor=-1&limit=20");
    expect(store.mergedColumns.map((column) => [column.name, column.cardSort, column.statuses.map((item) => item.id)])).toEqual([["To Do", "MANUAL", ["a-todo", "b-todo"]], ["Done", "PRIORITY", ["a-done"]]]);
    expect(store.statuses.map((item) => item.id)).toEqual(["a-todo", "b-todo", "a-done"]);
  });

  it("pages a merged column and saves its sort", async () => {
    serve({
      "/boards/all/columns/cards/page?name=To%20Do&cursor=1": { items: [card("c3", "a", "a-todo", { position: 1 })], nextCursor: null },
      "/boards/all/columns/sort": (_path: string, options?: RequestInit) => ({ name: "To Do", cardSort: JSON.parse(String(options?.body)).cardSort }),
    });
    const store = await storeWith();
    store.selectedId = "all";
    await store.loadBoard();
    await store.loadMoreColumn("to do");
    expect(store.cards.map((item) => item.id)).toEqual(["c1", "c2", "c3"]);
    expect(store.pageCursors["column:to do"]).toBeNull();

    await store.setColumnSort("to do", "PRIORITY_LAST");
    expect(apiMock).toHaveBeenCalledWith("/boards/all/columns/sort", expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "To Do", cardSort: "PRIORITY_LAST" }) }));
    expect(store.mergedColumns[0].cardSort).toBe("PRIORITY_LAST");
    expect(store.cards.map((item) => item.id).sort()).toEqual(["c1", "c2"]);
  });

  it("shares card changes across cached views", async () => {
    serve({
      "/boards/a/cards/c1/archive": card("c1", "a", "a-todo", { archived: true }),
      "/boards/a/cards/c1": card("c1", "a", "a-todo", { title: "Renamed", updatedAt: "u2" }),
      "/boards/a/cards": card("c9", "a", "a-done"),
    });
    const store = await storeWith();
    store.selectedId = "a"; await store.loadBoard();
    store.selectedId = "all"; await store.loadBoard();

    await store.updateCard(store.cards.find((item) => item.id === "c1")!, { title: "Renamed", body: "{}", priority: "MEDIUM" });
    await store.createCard({ title: "", body: "{}", priority: "MEDIUM", statusId: "a-done" }, "a");
    expect(apiMock).toHaveBeenCalledWith("/boards/a/cards", expect.objectContaining({ method: "POST" }));
    store.selectedId = "a"; await store.loadBoard();
    expect(store.cards.find((item) => item.id === "c1")?.title).toBe("Renamed");
    expect(store.cards.map((item) => item.id)).toContain("c9");

    await store.archiveCard(store.cards.find((item) => item.id === "c1")!);
    store.selectedId = "all"; await store.loadBoard();
    expect(store.cards.map((item) => item.id)).not.toContain("c1");
  });

  it("sends card changes to the card's own board", async () => {
    serve({
      "/boards/b/cards/c2/move": card("c2", "b", "b-todo"),
      "/boards/b/cards/c2/archive": card("c2", "b", "b-todo", { archived: true }),
      "/boards/b/cards/c2": card("c2", "b", "b-todo", { title: "Edited" }),
    });
    const store = await storeWith();
    store.selectedId = "all"; await store.loadBoard();
    const target = store.cards.find((item) => item.id === "c2")!;

    await store.updateCard(target, { title: "Edited", body: "{}", priority: "MEDIUM" });
    expect(apiMock).toHaveBeenCalledWith("/boards/b/cards/c2", expect.objectContaining({ method: "PUT" }));
    await store.moveCard(target, "b-todo", 0);
    expect(apiMock).toHaveBeenCalledWith("/boards/b/cards/c2/move", expect.objectContaining({ method: "POST" }));
    await store.archiveCard(target);
    expect(apiMock).toHaveBeenCalledWith("/boards/b/cards/c2/archive", expect.objectContaining({ method: "POST" }));
  });

  // AB-14, AB-16
  it("adds a created column to the board and the merged columns", async () => {
    const created = status("b-review", "b", "Review", 1);
    serve({
      "/boards/b/cards/c2/move-to-column": { card: card("c2", "b", "b-review"), status: created, statusCreated: true },
      "/boards/b/cards/in-column": { card: card("c5", "b", "b-review"), status: created, statusCreated: false },
    });
    const store = await storeWith();
    store.selectedId = "b"; await store.loadBoard();
    store.selectedId = "all"; await store.loadBoard();

    const placed = await store.moveCardToColumn(store.cards.find((item) => item.id === "c2")!, "Review", 0);
    expect(apiMock).toHaveBeenCalledWith("/boards/b/cards/c2/move-to-column", expect.objectContaining({ method: "POST", body: JSON.stringify({ columnName: "Review", position: 0 }) }));
    expect(placed.statusCreated).toBe(true);
    expect(store.mergedColumns.map((column) => column.name)).toEqual(["To Do", "Done", "Review"]);
    expect(store.cards.find((item) => item.id === "c2")?.statusId).toBe("b-review");

    const added = await store.createCardInColumn("b", "review", { title: "", body: "{}", priority: "MEDIUM" });
    expect(apiMock).toHaveBeenCalledWith("/boards/b/cards/in-column", expect.objectContaining({ method: "POST", body: JSON.stringify({ columnName: "review", title: "", body: "{}", priority: "MEDIUM" }) }));
    expect(added.card.id).toBe("c5");
    expect(store.cards.map((item) => item.id)).toContain("c5");

    store.selectedId = "b"; await store.loadBoard();
    expect(store.statuses.map((item) => item.id)).toEqual(["b-todo", "b-review"]);
    expect(store.cards.map((item) => item.id).sort()).toEqual(["c2", "c5"]);
  });

  // AB-17
  it("moves a transferred card between cached board views", async () => {
    serve({ "/boards/a/cards/c1/transfer": { card: card("c1", "b", "b-todo", { position: 1 }), status: boardB[0], statusCreated: false } });
    const store = await storeWith();
    store.selectedId = "a"; await store.loadBoard();
    store.selectedId = "b"; await store.loadBoard();
    store.selectedId = "all"; await store.loadBoard();

    const moved = await store.transferCard(store.cards.find((item) => item.id === "c1")!, "b");
    expect(apiMock).toHaveBeenCalledWith("/boards/a/cards/c1/transfer", expect.objectContaining({ method: "POST", body: JSON.stringify({ boardId: "b" }) }));
    expect(moved.card.boardId).toBe("b");
    store.selectedId = "a"; await store.loadBoard();
    expect(store.cards.map((item) => item.id)).toEqual([]);
    store.selectedId = "b"; await store.loadBoard();
    expect(store.cards.map((item) => item.id).sort()).toEqual(["c1", "c2"]);
  });

  // AB-20
  it("loads the All boards timeline", async () => {
    serve({ "/boards/all/gantt": [card("dated", "a", "a-todo", { startDate: "2026-09-02", dueDate: "2026-09-03" })] });
    const store = await storeWith();
    store.selectedId = "all";
    await store.loadGantt("2026-09-01", "2026-09-10");
    expect(apiMock).toHaveBeenCalledWith("/boards/all/gantt?from=2026-09-01&to=2026-09-10");
    expect(store.ganttCards.map((item) => item.id)).toEqual(["dated"]);
    const calls = apiMock.mock.calls.length;
    await store.loadGantt("2026-09-01", "2026-09-10");
    expect(apiMock.mock.calls.length).toBe(calls);
  });

  it("fetches the All boards view again after a board is created from it", async () => {
    serve({ "/boards": { id: "c", name: "C", archived: false, createdAt: "", updatedAt: "" }, "/boards/c/statuses": [], });
    const store = await storeWith();
    store.selectedId = "all"; await store.loadBoard();
    await store.createBoard("C");
    expect(store.selectedId).toBe("c");
    const calls = apiMock.mock.calls.length;
    store.selectedId = "all"; await store.loadBoard();
    expect(apiMock.mock.calls.slice(calls).map(([path]) => path)).toContain("/boards/all/columns");
  });

  it("keeps All boards selected when the board list loads", async () => {
    serve();
    const store = await storeWith();
    store.selectedId = "all";
    await store.loadBoards();
    expect(store.selectedId).toBe("all");
  });

  it("forgets cached views when boards change elsewhere", async () => {
    serve();
    const store = await storeWith();
    await store.loadBoards();
    store.selectedId = "a"; await store.loadBoard();
    store.selectedId = "b"; await store.loadBoard();
    store.invalidate();
    const calls = apiMock.mock.calls.length;
    await store.loadBoards();
    store.selectedId = "a"; await store.loadBoard();
    expect(apiMock.mock.calls.length).toBeGreaterThan(calls + 1);
  });
});
