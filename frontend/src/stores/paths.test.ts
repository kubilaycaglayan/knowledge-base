import { createPinia, setActivePinia } from "pinia";
import { api } from "../lib/api";
import { useBoardsStore } from "./boards";
import { usePathsStore, type Path } from "./paths";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const path = (id: string, status = "ACTIVE"): Path => ({ id, name: id, status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

// TH-15 (docs/test-hardening-plan.md)
describe("paths store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.mockReset();
  });

  it("shares one request between concurrent loads and caches the result", async () => {
    const pending = deferred<Path[]>();
    mockedApi.mockReturnValue(pending.promise);
    const store = usePathsStore();
    const first = store.load();
    const second = store.load();
    pending.resolve([path("a"), path("b", "ARCHIVED")]);
    expect(await first).toEqual(await second);
    expect(mockedApi).toHaveBeenCalledTimes(1);
    await store.load();
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(store.activePaths.map((value) => value.id)).toEqual(["a"]);
    expect(store.byId("b")?.status).toBe("ARCHIVED");
  });

  it("ignores a load that finishes after a reset", async () => {
    const pending = deferred<Path[]>();
    mockedApi.mockReturnValue(pending.promise);
    const store = usePathsStore();
    const loading = store.load();
    store.reset();
    pending.resolve([path("previous-user")]);
    await loading;
    expect(store.paths).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("invalidates cached boards on every path change", async () => {
    const store = usePathsStore();
    const invalidate = vi.spyOn(useBoardsStore(), "invalidate");
    store.add(path("a"));
    store.replace({ ...path("a"), name: "Renamed" });
    store.setPinned({ ...path("a"), pinned: true });
    store.setOrder([path("a")]);
    store.remove("a");
    store.restore(path("a"));
    expect(invalidate).toHaveBeenCalledTimes(6);
    mockedApi.mockResolvedValue([path("a")]);
    await store.load(true);
    expect(invalidate).toHaveBeenCalledTimes(7);
    store.setAll([path("b")]);
    expect(invalidate).toHaveBeenCalledTimes(7);
    expect(store.paths.map((value) => value.id)).toEqual(["b"]);
  });

  it("restores a path without duplicating it", () => {
    const store = usePathsStore();
    store.setAll([path("a"), path("b")]);
    store.restore({ ...path("a"), name: "Back" });
    expect(store.paths.map((value) => value.name)).toEqual(["b", "Back"]);
  });
});
