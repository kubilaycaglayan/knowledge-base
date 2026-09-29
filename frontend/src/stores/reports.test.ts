import { createPinia, setActivePinia } from "pinia";
import { useReportsStore } from "./reports";

// TH-16 (docs/test-hardening-plan.md)
describe("reports store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("caches reports by key and clears them all", () => {
    const store = useReportsStore();
    store.set("week:2026-09-28", { total: 3600 });
    expect(store.get<{ total: number }>("week:2026-09-28")?.total).toBe(3600);
    expect(store.get("month:2026-09")).toBeUndefined();
    store.clear();
    expect(store.get("week:2026-09-28")).toBeUndefined();
  });
});
