import { createPinia, setActivePinia } from "pinia";
import { useLogsStore, type Log } from "./logs";

const log = (id: string, occurredAt: string): Log => ({
  id,
  body: id,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  version: 0,
});

// TH-16 (docs/test-hardening-plan.md)
describe("logs store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("keeps logs newest first, breaking ties by id, when upserting", () => {
    const store = useLogsStore();
    store.setAll([log("b", "2026-09-02T09:00:00Z"), log("a", "2026-09-01T09:00:00Z")]);
    store.upsert(log("c", "2026-09-01T12:00:00Z"));
    store.upsert(log("d", "2026-09-02T09:00:00Z"));
    expect(store.logs.map((value) => value.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("moves an edited log to its new time without duplicating it", () => {
    const store = useLogsStore();
    store.setAll([log("b", "2026-09-02T09:00:00Z"), log("a", "2026-09-01T09:00:00Z")]);
    store.upsert({ ...log("a", "2026-09-03T09:00:00Z"), body: "Edited" });
    expect(store.logs.map((value) => value.id)).toEqual(["a", "b"]);
    expect(store.logs[0].body).toBe("Edited");
  });

  it("removes logs and replaces labels only on a known log", () => {
    const store = useLogsStore();
    store.setAll([log("a", "2026-09-01T09:00:00Z")]);
    store.replaceLabels("a", ["l1"]);
    store.replaceLabels("missing", ["l2"]);
    expect(store.logs[0].labelIds).toEqual(["l1"]);
    store.remove("a");
    store.remove("missing");
    expect(store.logs).toEqual([]);
  });
});
