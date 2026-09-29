import { createPinia, setActivePinia } from "pinia";
import { useCalendarStore } from "./calendar";

// TH-16 (docs/test-hardening-plan.md)
describe("calendar store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("merges loaded ranges and remembers each range once", () => {
    const store = useCalendarStore();
    store.setRange("2026-09", [{ date: "2026-09-01", note: "One", labels: [] }]);
    store.setRange("2026-10", [{ date: "2026-10-01", note: "Two", labels: [] }]);
    store.setRange("2026-09", [{ date: "2026-09-01", note: "Reloaded", labels: [] }]);
    expect(store.loadedRanges).toEqual(["2026-09", "2026-10"]);
    expect(store.byDate("2026-09-01")?.note).toBe("Reloaded");
    expect(store.byDate("2026-10-01")?.note).toBe("Two");
  });

  it("drops a day that no longer has a note or labels", () => {
    const store = useCalendarStore();
    const label = { labelId: "l1", name: "Leave", portion: 1 };
    store.setDay({ date: "2026-09-01", note: null, labels: [label] });
    expect(store.byDate("2026-09-01")?.labels).toEqual([label]);
    store.setDay({ date: "2026-09-01", note: "", labels: [] });
    expect(store.byDate("2026-09-01")).toBeUndefined();
    expect("2026-09-01" in store.days).toBe(false);
  });
});
