import { createPinia, setActivePinia } from "pinia";
import { useLabelsStore } from "./labels";
import { usePathsStore } from "./paths";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("reference data stores", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shares reactive path changes and exposes active paths", () => {
    const store = usePathsStore();
    store.add({ id: "p1", name: "Study", status: "ACTIVE" });
    store.add({ id: "p2", name: "Archived", status: "ARCHIVED" });

    expect(store.activePaths.map((path) => path.id)).toEqual(["p1"]);
    store.remove("p1");
    expect(store.byId("p1")).toBeUndefined();
  });

  it("loads labels once into shared state and updates assignments", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: "l1", name: "Focus", scopes: ["TIME_ENTRY"] },
    ]);
    const store = useLabelsStore();

    await store.load();
    expect(store.forScope("TIME_ENTRY")).toHaveLength(1);
    store.replace({ id: "l1", name: "Deep focus", scopes: ["NOTE"] });
    expect(store.byId("l1")?.name).toBe("Deep focus");
    expect(store.forScope("TIME_ENTRY")).toHaveLength(0);
  });
});
