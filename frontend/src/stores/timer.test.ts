import { createPinia, setActivePinia } from "pinia";
import { useTimerStore } from "./timer";
import { api } from "../lib/api";
import { flushPromises } from "@vue/test-utils";
import { useSessionsStore } from "./sessions";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("timer store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem("know_token");
  });

  it("uses the WebSocket without starting the HTTP polling loop", async () => {
    vi.useFakeTimers();
    const originalWebSocket = globalThis.WebSocket;
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onopen?.());
      }
      send() {
        this.onmessage?.({ data: '{"type":"READY"}' });
      }
      close() {}
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/timers/current") return null;
      if (path === "/timers/draft") return {};
      return [];
    });

    const store = useTimerStore();
    store.acquire();
    await flushPromises();
    const requestCount = vi.mocked(api).mock.calls.length;

    await vi.advanceTimersByTimeAsync(2000);

    expect(vi.mocked(api).mock.calls.length).toBe(requestCount);
    store.release();
    globalThis.WebSocket = originalWebSocket;
  });

  it("starts HTTP polling after the WebSocket closes", async () => {
    vi.useFakeTimers();
    const originalWebSocket = globalThis.WebSocket;
    let socket: MockSocket;
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        socket = this;
        queueMicrotask(() => this.onopen?.());
      }
      send() {
        this.onmessage?.({ data: '{"type":"READY"}' });
      }
      close() {}
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/timers/current") return null;
      if (path === "/timers/draft") return {};
      return [];
    });

    const store = useTimerStore();
    store.acquire();
    await flushPromises();
    const connectedRequestCount = vi.mocked(api).mock.calls.length;

    socket!.onclose?.();
    await flushPromises();

    expect(vi.mocked(api).mock.calls.length).toBeGreaterThan(
      connectedRequestCount,
    );
    store.release();
    globalThis.WebSocket = originalWebSocket;
  });

  it("shares idle selections between consumers and persists them for another tab", async () => {
    let serverDraft = { pathId: "", labelIds: [] as string[], description: "" };
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/timers/current") return null;
      if (path === "/timers/draft") {
        if (options.method === "PUT")
          serverDraft = JSON.parse(options.body as string);
        return structuredClone(serverDraft);
      }
      return [];
    });
    const inline = useTimerStore();
    inline.pathId = "path-1";
    inline.selectedLabelIds = ["label-1"];
    inline.description = "Read chapter";
    await inline.updateTimer();
    const floating = useTimerStore();
    expect(floating).toBe(inline);
    expect(floating.description).toBe("Read chapter");
    setActivePinia(createPinia());
    const otherTab = useTimerStore();
    await otherTab.sync();
    expect(otherTab.pathId).toBe("path-1");
    expect(otherTab.selectedLabelIds).toEqual(["label-1"]);
    expect(otherTab.description).toBe("Read chapter");
    serverDraft = { pathId: "", labelIds: [], description: "Remote edit" };
    await otherTab.sync();
    expect(otherTab.selectedLabelIds).toEqual([]);
    expect(otherTab.description).toBe("Remote edit");
  });

  it("shares pending saves across consumers and keeps edits made during a request", async () => {
    const pending: { body: any; resolve: (value: any) => void }[] = [];
    vi.mocked(api).mockImplementation((path, options = {}) => {
      if (options.method === "PUT")
        return new Promise((resolve) =>
          pending.push({ body: JSON.parse(options.body as string), resolve }),
        );
      return Promise.resolve([]);
    });
    const store = useTimerStore();
    store.description = "First";
    const first = store.updateTimer();
    const floating = useTimerStore();
    floating.description = "Second";
    await floating.updateTimer();
    expect(pending).toHaveLength(1);
    pending[0].resolve(pending[0].body);
    await first;
    await flushPromises();
    expect(store.description).toBe("Second");
    expect(pending).toHaveLength(2);
    expect(pending[1].body.description).toBe("Second");
    pending[1].resolve(pending[1].body);
    await flushPromises();
    expect(store.busy).toBe(false);
  });

  it("preserves exact server start seconds when only labels change", async () => {
    const store = useTimerStore();
    store.setCurrent({
      id: "timer",
      startedAt: "2026-09-12T10:00:47.123Z",
      labelIds: [],
      running: true,
    });
    vi.mocked(api).mockImplementation(async (_path, options = {}) => ({
      id: "timer",
      running: true,
      ...JSON.parse(options.body as string),
    }));
    store.selectedLabelIds = ["label"];
    await store.updateTimer();
    expect(
      JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).startedAt,
    ).toBe("2026-09-12T10:00:47.123Z");
  });

  it("invalidates history and applies remote changes, including stop", async () => {
    const store = useTimerStore();
    store.setCurrent({
      id: "timer",
      startedAt: "2026-09-12T10:00:00Z",
      description: "First",
      running: true,
    });
    useSessionsStore().setPage("0:50", {
      sessions: [],
      page: 0,
      totalPages: 1,
      totalSessions: 0,
    });
    vi.mocked(api).mockResolvedValueOnce({
      ...store.current,
      description: "Remote",
    });
    await store.sync();
    expect(store.description).toBe("Remote");
    expect(useSessionsStore().cachedPage("0:50")).toBeUndefined();
    vi.mocked(api).mockResolvedValue(null);
    await store.sync();
    expect(store.isRunning).toBe(false);
    expect(store.description).toBe("");
    expect(store.historyVersion).toBe(2);
  });

  it("clears the completed timer form and server draft after stopping", async () => {
    const store = useTimerStore();
    store.setCurrent({
      id: "timer",
      pathId: "path-1",
      labelIds: ["label-1"],
      startedAt: "2026-09-12T10:00:00Z",
      description: "Read chapter",
      running: true,
    });
    store.pathId = "path-1";
    store.selectedLabelIds = ["label-1"];
    store.description = "Read chapter";
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path.endsWith("/stop")) return null;
      if (path === "/timers/draft" && options.method === "PUT")
        return JSON.parse(options.body as string);
      return null;
    });

    await store.toggleRun();

    expect(store.pathId).toBe("");
    expect(store.selectedLabelIds).toEqual([]);
    expect(store.description).toBe("");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/draft",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ pathId: null, labelIds: [], description: null }),
      }),
    );
  });

  it("does not restore another account's fields from a delayed response", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const store = useTimerStore();
    const request = store.sync();
    store.clear();
    resolve({
      id: "old-account",
      startedAt: "2026-09-12T10:00:00Z",
      description: "Private",
    });
    await request;
    expect(store.current).toBeNull();
    expect(store.description).toBe("");
  });

  it("does not replace the focused description before the first keystroke", async () => {
    const textarea = document.createElement("textarea");
    textarea.id = "tt-desc";
    document.body.append(textarea);
    textarea.focus();
    let draft = {
      pathId: "",
      labelIds: [] as string[],
      description: "Existing",
    };
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/timers/current" ? null : structuredClone(draft),
    );
    const store = useTimerStore();
    await store.sync();
    expect(store.description).toBe("Existing");
    draft = { ...draft, description: "Remote edit" };
    await store.sync();
    expect(store.description).toBe("Existing");
    textarea.blur();
    await store.sync();
    expect(store.description).toBe("Remote edit");
    textarea.remove();
  });

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
