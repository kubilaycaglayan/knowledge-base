import { createPinia, setActivePinia } from "pinia";
import { useTimerStore } from "./timer";

describe("timer store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("reactively replaces server timer state and clears it", () => {
    const store = useTimerStore();
    const initialVersion = store.version;
    store.setCurrent({ id: "timer-1", startedAt: "2026-09-12T10:00:00Z" });
    expect(store.isRunning).toBe(true);
    expect(store.current?.id).toBe("timer-1");
    expect(store.version).toBeGreaterThan(initialVersion);

    store.clear();
    expect(store.current).toBeNull();
    expect(store.isRunning).toBe(false);
  });
});
