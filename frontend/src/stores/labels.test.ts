import { createPinia, setActivePinia } from "pinia";
import { api } from "../lib/api";
import { defaultLabelScopes, useLabelsStore, type Label } from "./labels";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const label = (id: string, scopes: Label["scopes"]): Label => ({ id, name: id, scopes });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

// TH-14 (docs/test-hardening-plan.md)
describe("labels store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.mockReset();
  });

  it("defaults new labels to every scope except the Calendar", () => {
    expect(defaultLabelScopes()).toEqual(["NOTE", "TIME_ENTRY", "LOG", "BOARD"]);
    expect(defaultLabelScopes()).not.toBe(defaultLabelScopes());
  });

  it("loads the catalog once unless forced", async () => {
    mockedApi.mockResolvedValue([label("a", ["NOTE"])]);
    const store = useLabelsStore();
    await store.load();
    await store.load();
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(store.byId("a")?.name).toBe("a");
    await store.load(true);
    expect(mockedApi).toHaveBeenCalledTimes(2);
    expect(store.loading).toBe(false);
  });

  it("shares one request between concurrent loads of a scope and merges the result", async () => {
    const pending = deferred<Label[]>();
    mockedApi.mockReturnValue(pending.promise);
    const store = useLabelsStore();
    store.setAll([label("kept", ["NOTE"]), label("b", ["NOTE"])]);
    const first = store.loadScope("BOARD");
    const second = store.loadScope("BOARD");
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi).toHaveBeenCalledWith("/labels?scope=BOARD");
    pending.resolve([label("b", ["NOTE", "BOARD"]), label("c", ["BOARD"])]);
    await Promise.all([first, second]);
    expect(store.labels.map((value) => value.id).sort()).toEqual(["b", "c", "kept"]);
    expect(store.forScope("BOARD").map((value) => value.id).sort()).toEqual(["b", "c"]);
    await store.loadScope("BOARD");
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });

  it("drops responses that arrive after a reset", async () => {
    const catalog = deferred<Label[]>();
    const scoped = deferred<Label[]>();
    mockedApi.mockReturnValueOnce(catalog.promise).mockReturnValueOnce(scoped.promise);
    const store = useLabelsStore();
    const loading = store.load();
    const scoping = store.loadScope("LOG");
    store.reset();
    catalog.resolve([label("previous-user", ["NOTE"])]);
    scoped.resolve([label("previous-user-log", ["LOG"])]);
    await Promise.all([loading, scoping]);
    expect(store.labels).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.loadedScopes).toEqual([]);
  });

  it("replaces, adds, and removes labels", () => {
    const store = useLabelsStore();
    store.setAll([label("a", ["NOTE"])]);
    store.add(label("b", ["LOG"]));
    store.replace({ ...label("a", ["NOTE"]), name: "Renamed" });
    store.remove("b");
    expect(store.labels).toEqual([{ id: "a", name: "Renamed", scopes: ["NOTE"] }]);
  });
});
