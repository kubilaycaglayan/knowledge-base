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
});
