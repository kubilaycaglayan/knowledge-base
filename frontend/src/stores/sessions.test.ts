import { createPinia, setActivePinia } from "pinia";
import { useSessionsStore } from "./sessions";

// TH-16 (docs/test-hardening-plan.md)
describe("sessions store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("caches pages by key and clears them all", () => {
    const store = useSessionsStore();
    const page = { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
    store.setPage("all:0", page);
    expect(store.cachedPage("all:0")).toEqual(page);
    expect(store.cachedPage("all:1")).toBeUndefined();
    store.clearPages();
    expect(store.cachedPage("all:0")).toBeUndefined();
  });
});
