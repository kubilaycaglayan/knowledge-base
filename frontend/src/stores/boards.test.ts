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
});
