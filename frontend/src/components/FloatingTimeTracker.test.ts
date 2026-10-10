import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import FloatingTimeTracker from "./FloatingTimeTracker.vue";
import { api } from "../lib/api";
import vuetify from "../plugins/vuetify";
import { createPinia, setActivePinia } from "pinia";
import { useReportsStore } from "../stores/reports";
import { useSessionsStore } from "../stores/sessions";
import { useTimerStore } from "../stores/timer";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
function stubViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: isDesktop && query === "(min-width: 641px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("FloatingTimeTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubViewport(true);
    setActivePinia(createPinia());
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (
          path === "/paths" ||
          path === "/labels?scope=TIME_ENTRY" ||
          path === "/calendar/labels"
        )
          return [];
        if (path === "/timers/current") return null;
        if (path === "/timers" && options.method === "POST")
          return {
            id: "timer-1",
            startedAt: new Date().toISOString(),
            running: true,
          };
        return undefined;
      },
    );
  });

  afterEach(() => {
    document.querySelectorAll(".label-picker-menu").forEach((menu) => menu.remove());
    vi.unstubAllGlobals();
    if (originalMatchMedia)
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    else Reflect.deleteProperty(window, "matchMedia");
  });

  it("preserves Sessions' ability to start without a path or label", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get("button.floating-tracker-action").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers",
      expect.objectContaining({ method: "POST" }),
    );
    wrapper.unmount();
  });

  it("resolves a start conflict to the account's already-running timer", async () => {
    let timerStartedElsewhere = false;
    const existingTimer = {
      id: "timer-existing",
      pathId: "path-existing",
      description: "Session started in another tab",
      labelIds: [],
      startedAt: new Date().toISOString(),
      running: true,
    };
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (
          path === "/paths" ||
          path === "/labels?scope=TIME_ENTRY" ||
          path === "/calendar/labels"
        )
          return [];
        if (path === "/timers/current")
          return timerStartedElsewhere ? existingTimer : null;
        if (path === "/timers" && options.method === "POST") {
          timerStartedElsewhere = true;
          throw new Error("A timer is already running");
        }
        return undefined;
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Start timer"]').trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/timers" && options?.method === "POST")).toBe(true);
    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers/current");
    expect(wrapper.find('button[aria-label="Start timer"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(true);
    const timerStore = useTimerStore();
    expect(timerStore.current?.id).toBe("timer-existing");
    expect(timerStore.pathId).toBe("path-existing");
    expect(timerStore.description).toBe("Session started in another tab");
    expect(wrapper.find(".tracker-error").exists()).toBe(false);
  });

  it("visibly advances the running timer once per second", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:00:00Z"));
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current")
        return { id: "timer-1", labelIds: [], startedAt: "2026-09-12T10:00:00Z", running: true };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    try {
      await flushPromises();
      expect(wrapper.get('[role="timer"]').text()).toBe("00:00:00");
      await vi.advanceTimersByTimeAsync(2000);
      expect(wrapper.get('[role="timer"]').text()).toBe("00:00:02");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("starts immediately when the description is edited before clicking start", async () => {
    let resolveDraft: (() => void) | undefined;
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/timers/draft" && options.method === "PUT") {
        await new Promise<void>((resolve) => {
          resolveDraft = resolve;
        });
        return JSON.parse(options.body as string);
      }
      if (path === "/timers" && options.method === "POST")
        return { id: "timer-1", startedAt: new Date().toISOString(), running: true };
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    try {
      await flushPromises();
      const description = wrapper.get('textarea[aria-label="Timer description"]');
      await description.setValue("Read a chapter");
      (description.element as HTMLElement).focus();
      const action = wrapper.get("button.floating-tracker-action");
      await description.trigger("change");
      expect(action.attributes("disabled")).toBeUndefined();
      (action.element as HTMLElement).click();
      resolveDraft?.();
      await flushPromises();
      resolveDraft?.();
      await flushPromises();

      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/timers",
        expect.objectContaining({ method: "POST" }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    } finally {
      wrapper.unmount();
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("invalidates reports and emits a change when a session is stopped", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
        if (path === "/timers/current")
          return {
            id: "timer-1",
            startedAt: new Date().toISOString(),
            running: true,
          };
        if (path === "/timers/timer-1/stop" && options.method === "POST")
          return undefined;
        return undefined;
      },
    );
    const reports = useReportsStore();
    const sessions = useSessionsStore();
    reports.set("week", { totalSeconds: 60 });
    sessions.setPage("0:50", {
      sessions: [],
      page: 0,
      totalPages: 1,
      totalSessions: 0,
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get("button.floating-tracker-action").trigger("click");
    await flushPromises();

    expect(reports.get("week")).toBeUndefined();
    expect(sessions.cachedPage("0:50")).toBeUndefined();
    expect(wrapper.emitted("changed")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps a running session after a failed stop and clears it after retry succeeds", async () => {
    let stopAttempts = 0;
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
        if (path === "/timers/current")
          return {
            id: "timer-1",
            startedAt: new Date().toISOString(),
            running: true,
          };
        if (path === "/timers/timer-1/stop" && options.method === "POST") {
          stopAttempts += 1;
          if (stopAttempts === 1) throw new Error("Temporary server failure");
          return undefined;
        }
        return undefined;
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Stop timer"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".tracker-error").text()).toContain("Could not update the timer.");
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="Stop timer"]').trigger("click");
    await flushPromises();
    expect(stopAttempts).toBe(2);
    expect(wrapper.find(".tracker-error").exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Start timer"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("confirms before discarding a running session and preserves it when cancelled", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current")
        return {
          id: "timer-1",
          labelIds: [],
          description: "Discardable work",
          startedAt: new Date().toISOString(),
          running: true,
        };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Discard session"]').trigger("click");
    const confirmation = wrapper.get('[role="dialog"]');
    expect(confirmation.text()).toContain("Discard this running session?");
    await confirmation.get("button.text-button").trigger("click");
    await flushPromises();
    expect(
      vi.mocked(api).mock.calls.some(([path]) => path === "/timers/timer-1/cancel"),
    ).toBe(false);
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="Discard session"]').trigger("click");
    await wrapper.get('[role="dialog"] button.primary').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wrapper.find('button[aria-label="Start timer"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps a running session after failed discard and clears it after retry", async () => {
    let attempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current")
        return {
          id: "timer-1",
          labelIds: [],
          description: "Discard retry",
          startedAt: new Date().toISOString(),
          running: true,
        };
      if (path === "/timers/timer-1/cancel" && options.method === "POST") {
        attempts += 1;
        if (attempts === 1) throw new Error("Temporary server failure");
        return undefined;
      }
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Discard session"]').trigger("click");
    await wrapper.get('[role="dialog"] button.primary').trigger("click");
    await flushPromises();
    expect(wrapper.get(".tracker-error").text()).toContain("Could not discard the session.");
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="Discard session"]').trigger("click");
    await wrapper.get('[role="dialog"] button.primary').trigger("click");
    await flushPromises();
    expect(attempts).toBe(2);
    expect(wrapper.find(".tracker-error").exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Start timer"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("reconciles a failed discard when the server later reports no current timer", async () => {
    let currentTimer: Record<string, unknown> | null = {
      id: "timer-1",
      labelIds: [],
      description: "Remote discard",
      startedAt: new Date().toISOString(),
      running: true,
    };
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return currentTimer;
      if (path === "/timers/timer-1/cancel") throw new Error("Response lost");
      if (path === "/timers/draft") return {};
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Discard session"]').trigger("click");
    await wrapper.get('[role="dialog"] button.primary').trigger("click");
    await flushPromises();
    expect(wrapper.get('button[aria-label="Stop timer"]').exists()).toBe(true);
    expect(wrapper.get(".tracker-error").text()).toContain("Could not discard the session.");

    currentTimer = null;
    await useTimerStore().sync();
    await flushPromises();
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Start timer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("starts the session with the typed description on Cmd+Enter in the description", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const description = wrapper.get('textarea[aria-label="Timer description"]');
    await description.setValue("Read a chapter");
    await description.trigger("keydown", { key: "Enter", metaKey: true });
    await flushPromises();

    const start = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/timers" && init?.method === "POST");
    expect(JSON.parse(start?.[1]?.body as string).description).toBe("Read a chapter");
    wrapper.unmount();
  });

  it("saves the typed description and stops the session on Ctrl+Enter in the description", async () => {
    const calls: string[] = [];
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (options.method) calls.push(`${options.method} ${path}`);
        if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
        if (path === "/timers/current")
          return { id: "timer-1", startedAt: new Date().toISOString(), running: true };
        if (path === "/timers/timer-1" && options.method === "PUT")
          return {
            id: "timer-1",
            startedAt: new Date().toISOString(),
            running: true,
            ...JSON.parse(options.body as string),
          };
        return undefined;
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const description = wrapper.get('textarea[aria-label="Timer description"]');
    // Typing fires input only; change would not fire until the field blurs.
    (description.element as HTMLTextAreaElement).value = "Finished the chapter";
    await description.trigger("input");
    await description.trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();

    expect(calls.slice(0, 2)).toEqual(["PUT /timers/timer-1", "POST /timers/timer-1/stop"]);
    const save = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/timers/timer-1" && init?.method === "PUT");
    expect(JSON.parse(save?.[1]?.body as string).description).toBe("Finished the chapter");
    wrapper.unmount();
  });

  // SP-07
  it("shows pause while running and resume while paused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:01:05Z"));
    let paused = false;
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths") return [{ id: "path-1", name: "Knowledge Base", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current")
        return paused ? null : { id: "timer-1", pathId: "path-1", labelIds: [], startedAt: new Date(Date.now() - 65_000).toISOString(), carriedSeconds: 3600, running: true };
      if (path === "/timers/pause" && options.method === "POST") {
        paused = true;
        return { pathId: "path-1", labelIds: [], description: null, pausedSeconds: 3665 };
      }
      if (path === "/timers/resume" && options.method === "POST")
        return { id: "timer-2", pathId: "path-1", labelIds: [], startedAt: new Date().toISOString(), carriedSeconds: 3665, running: true };
      if (path === "/timers/draft") return { pathId: "path-1", labelIds: [], description: null, pausedSeconds: paused ? 3665 : null };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, { global: { plugins: [vuetify] } });
    try {
      await flushPromises();

      expect(wrapper.get(".floating-tracker-clock").text()).toBe("01:01:05");
      const pause = wrapper.get("button.floating-tracker-pause");
      expect(pause.attributes("aria-label")).toBe("Pause session");
      expect(wrapper.get("button.floating-tracker-action").attributes("aria-label")).toBe("Stop timer");
      await pause.trigger("click");
      await flushPromises();

      expect(api).toHaveBeenCalledWith("/timers/pause", expect.objectContaining({ method: "POST" }));
      expect(wrapper.get(".floating-tracker-clock").text()).toBe("01:01:05");
      expect(wrapper.get(".floating-tracker-clock").classes()).toContain("is-paused");
      expect(wrapper.get(".floating-tracker-summary").text()).toBe("Paused");
      expect(wrapper.get(".floating-tracker-path").text()).toBe("Knowledge Base");
      expect(wrapper.get("button.floating-tracker-pause").attributes("aria-label")).toBe("Resume session");
      expect(wrapper.get("button.floating-tracker-action").attributes("aria-label")).toBe("Stop timer");

      await vi.advanceTimersByTimeAsync(5_000);
      await flushPromises();
      expect(wrapper.get(".floating-tracker-clock").text()).toBe("01:01:05");

      await wrapper.get("button.floating-tracker-pause").trigger("click");
      await flushPromises();
      expect(api).toHaveBeenCalledWith("/timers/resume", expect.objectContaining({ method: "POST" }));
      expect(wrapper.get(".floating-tracker-clock").text()).toBe("01:01:05");
      expect(wrapper.get("button.floating-tracker-pause").attributes("aria-label")).toBe("Pause session");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  // SP-07
  it("hides the pause button while idle", async () => {
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();
    expect(wrapper.find("button.floating-tracker-pause").exists()).toBe(false);
    wrapper.unmount();
  });

  // SP-10
  it("resumes a paused session with Cmd+Enter", async () => {
    const calls: string[] = [];
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (options.method) calls.push(`${options.method} ${path}`);
      if (path === "/paths") return [{ id: "path-1", name: "Research", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] }];
      if (path === "/timers/current") return null;
      if (path === "/timers/draft" && !options.method) return { pathId: "path-1", labelIds: ["label-1"], description: "Paused work", pausedSeconds: 120 };
      if (path === "/timers/draft") return { ...JSON.parse(options.body as string), pausedSeconds: 120 };
      if (path === "/timers/resume")
        return { id: "timer-2", pathId: "path-1", labelIds: ["label-1"], description: "Paused work", startedAt: new Date().toISOString(), carriedSeconds: 120, running: true };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();
    const description = wrapper.get('textarea[aria-label="Timer description"]');
    await description.trigger("keydown", { key: "Enter", metaKey: true });
    await flushPromises();

    expect(calls).toContain("POST /timers/resume");
    expect(calls).not.toContain("POST /timers");
    expect(calls).not.toContain("POST /timers/finish");
    const timerStore = useTimerStore();
    expect(timerStore.current?.carriedSeconds).toBe(120);
    expect(timerStore.pathId).toBe("path-1");
    expect(timerStore.selectedLabelIds).toEqual(["label-1"]);
    expect(timerStore.description).toBe("Paused work");
    wrapper.unmount();
  });

  it("keeps plain Enter in the description as a newline without starting", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const description = wrapper.get('textarea[aria-label="Timer description"]');
    await description.setValue("Read");
    await description.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      "/timers",
      expect.objectContaining({ method: "POST" }),
    );
    wrapper.unmount();
  });

  it("clears the form when the WebSocket stop event wins the stop request race", async () => {
    const originalWebSocket = globalThis.WebSocket;
    const sockets: MockSocket[] = [];
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {
        this.onclose?.();
      }
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");

    const current = {
      id: "timer-1",
      pathId: "path-1",
      labelIds: ["label-1"],
      description: "Read chapter",
      startedAt: "2026-09-12T10:00:00Z",
      running: true,
    };
    let resolveStop: ((value: unknown) => void) | undefined;
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY")
        return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] }];
      if (path === "/timers/current") return current;
      if (path === "/timers/timer-1/stop" && options.method === "POST")
        return new Promise((resolve) => {
          resolveStop = resolve;
        });
      if (path === "/timers/draft" && options.method === "PUT")
        return JSON.parse(options.body as string);
      return undefined;
    });

    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });

    try {
      await flushPromises();
      expect(sockets).toHaveLength(1);
      expect(useTimerStore().description).toBe("Read chapter");

      await wrapper.get("button.floating-tracker-action").trigger("click");
      await nextTick();
      expect(resolveStop).toBeDefined();

      sockets[0].onmessage?.({
        data: JSON.stringify({ type: "TIMER_STATE", timer: null }),
      });
      resolveStop?.(undefined);
      await flushPromises();

      const timerStore = useTimerStore();
      expect(timerStore.pathId).toBe("");
      expect(timerStore.selectedLabelIds).toEqual([]);
      expect(timerStore.description).toBe("");
      expect(wrapper.get('textarea[aria-label="Timer description"]').element)
        .toHaveProperty("value", "");
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/timers/draft",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ pathId: null, labelIds: [], description: null }),
        }),
      );
    } finally {
      wrapper.unmount();
      localStorage.removeItem("know_token");
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("applies an extension description update when the web field is focused but untouched", async () => {
    const originalWebSocket = globalThis.WebSocket;
    const sockets: MockSocket[] = [];
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {}
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    const current = {
      id: "timer-1",
      pathId: "path-1",
      labelIds: [],
      description: "Original description",
      startedAt: "2026-09-12T10:00:00Z",
      running: true,
    };
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return current;
      return undefined;
    });

    const wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    try {
      await flushPromises();
      expect(sockets).toHaveLength(1);
      const description = wrapper.get(
        'textarea[aria-label="Timer description"]',
      );
      HTMLElement.prototype.scrollIntoView = vi.fn();
      (description.element as HTMLTextAreaElement).focus();
      expect(document.activeElement).toBe(description.element);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      sockets[0].onmessage?.({
        data: JSON.stringify({
          type: "TIMER_STATE",
          timer: {
            ...current,
            description: "Changed from extension",
          },
        }),
      });
      await flushPromises();

      expect(description.element).toHaveProperty(
        "value",
        "Changed from extension",
      );
    } finally {
      wrapper.unmount();
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      localStorage.removeItem("know_token");
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("expands inline on Sessions and starts collapsed as a dock elsewhere", async () => {
    const inline = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    const floating = mount(FloatingTimeTracker, {
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    expect(inline.get(".floating-tracker-host").classes()).toContain("inline");
    expect(floating.get(".floating-tracker-host").classes()).not.toContain(
      "inline",
    );
    expect(inline.find("#floating-tracker-panel").exists()).toBe(true);
    expect(inline.find(".floating-tracker-toggle").exists()).toBe(false);
    expect(floating.find("#floating-tracker-panel").exists()).toBe(false);
    expect(
      floating.get(".floating-tracker-toggle").attributes("aria-expanded"),
    ).toBe("false");
    expect(
      floating.get("button.floating-tracker-action").classes(),
    ).not.toContain("is-running");
    expect(
      floating.get("button.floating-tracker-action").attributes("aria-label"),
    ).toBe("Start timer");
    expect(floating.get(".floating-tracker-clock").classes()).not.toContain(
      "is-running",
    );

    await floating.get(".floating-tracker-toggle").trigger("click");
    expect(floating.find("#floating-tracker-panel").exists()).toBe(true);
    inline.unmount();
    floating.unmount();
  });

  it("collapses the floating tracker when the page is clicked outside it", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get(".floating-tracker-toggle").trigger("click");
    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(true);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  async function openFloatingPathMenu() {
    // jsdom has no visualViewport, which Vuetify menus position against.
    vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 }));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths")
        return Array.from({ length: 15 }, (_, index) => ({
          id: `path-${index + 1}`,
          name: `Path ${index + 1}`,
          status: "ACTIVE",
        }));
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return null;
      if (path === "/timers" && options.method === "POST")
        return { id: "timer-1", pathId: "path-2", labelIds: [], description: "Write tests", startedAt: new Date().toISOString(), running: true };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    await wrapper.get(".floating-tracker-toggle").trigger("click");
    await wrapper.get(".tracker-path-select .v-field").trigger("mousedown");
    await flushPromises();
    const menu = document.querySelector<HTMLElement>(".tracker-path-menu");
    expect(menu).not.toBeNull();
    return { wrapper, menu: menu! };
  }

  it("stays open when the path menu's scrollbar is pressed", async () => {
    const { wrapper, menu } = await openFloatingPathMenu();

    // A press on the list's scrollbar targets the list itself.
    menu
      .querySelector(".v-list")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(true);
    expect(document.querySelector(".tracker-path-menu")).not.toBeNull();
    wrapper.unmount();
  });

  it("stays open and applies a path chosen from the floating path menu", async () => {
    const { wrapper, menu } = await openFloatingPathMenu();

    const item = [...menu.querySelectorAll<HTMLElement>(".v-list-item")].find(
      (element) => element.textContent?.includes("Path 2"),
    )!;
    item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    item.click();
    await flushPromises();

    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(true);
    expect(wrapper.get(".floating-tracker-path").text()).toBe("Path 2");
    wrapper.unmount();
  });

  it("starts a running session with the selected Path and description", async () => {
    const { wrapper, menu } = await openFloatingPathMenu();
    const pathOption = [...menu.querySelectorAll<HTMLElement>(".v-list-item")].find(
      (element) => element.textContent?.includes("Path 2"),
    )!;
    pathOption.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    pathOption.click();
    await flushPromises();
    await wrapper.get('textarea[aria-label="Timer description"]').setValue("Write tests");
    await wrapper.get('button[aria-label="Start timer"]').trigger("click");
    await flushPromises();

    const start = vi.mocked(api).mock.calls.find(([path, init]) => path === "/timers" && init?.method === "POST");
    expect(JSON.parse(start?.[1]?.body as string)).toMatchObject({
      pathId: "path-2",
      description: "Write tests",
    });
    expect(wrapper.find('button[aria-label="Stop timer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("stays open while the new path prompt opened from it is used", async () => {
    const { wrapper, menu } = await openFloatingPathMenu();

    const addItem = menu.querySelector<HTMLElement>(".v-list-item")!;
    addItem.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    addItem.click();
    await flushPromises();
    const prompt = document.querySelector<HTMLElement>(".prompt-dialog");
    expect(prompt).not.toBeNull();
    prompt!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(true);
    expect(document.querySelector(".prompt-dialog")).not.toBeNull();
    wrapper.unmount();
  });

  it.each([
    { viewport: "desktop", isDesktop: true, expands: true },
    { viewport: "mobile", isDesktop: false, expands: false },
  ])(
    "expands from the bar background only in the $viewport view",
    async ({ isDesktop, expands }) => {
      stubViewport(isDesktop);
      const wrapper = mount(FloatingTimeTracker, {
        attachTo: document.body,
        global: { plugins: [vuetify] },
      });
      await flushPromises();

      await wrapper.get(".floating-tracker-bar").trigger("click");

      expect(wrapper.find("#floating-tracker-panel").exists()).toBe(expands);
      wrapper.unmount();
    },
  );

  it("does not expand from clicks on floating tracker controls", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get(".floating-tracker-action").trigger("click");

    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the inline Sessions tracker expanded when its bar is clicked", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    await wrapper.get(".floating-tracker-bar").trigger("click");

    expect(wrapper.find("#floating-tracker-panel").exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps the path menu focused on adding or choosing an active path", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    const pathSelect = wrapper.findComponent(
      ".tracker-path-select",
    ) as VueWrapper<any>;
    expect(
      pathSelect.props("items").map((item: { id: string }) => item.id),
    ).toEqual(["__add_new_path__", "path-1"]);
    expect(pathSelect.props("placeholder")).toBe("Choose a path…");
    wrapper.unmount();
  });

  it("keeps the inline tracker in the page scroll flow on mobile", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    const trackerStyles = [...document.head.querySelectorAll("style")]
      .map((style) => style.textContent || "")
      .join("\n");
    expect(wrapper.get(".floating-tracker-host").classes()).toContain("inline");
    expect(trackerStyles).toContain(
      ".floating-tracker-host.inline .floating-tracker-panel",
    );
    expect(trackerStyles).toContain("max-height: none");
    expect(trackerStyles).toContain("overflow: visible");
    wrapper.unmount();
  });

  it("caps the timer description and enables internal scrolling", async () => {
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    const description = wrapper.get<HTMLTextAreaElement>(
      '[aria-label="Timer description"]',
    );
    expect(description.attributes("maxlength")).toBe("5000");
    const styles = [...document.head.querySelectorAll("style")]
      .map((style) => style.textContent || "")
      .join("\n");
    expect(styles).toContain("max-height: 200px");
    expect(styles).toContain("overflow-y: auto");
    wrapper.unmount();
  });

  it("opens the searchable label picker from its chevron", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/labels?scope=TIME_ENTRY")
        return [
          { id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] },
          { id: "label-2", name: "Review", scopes: ["TIME_ENTRY"] },
          { id: "label-3", name: "Planning", scopes: ["TIME_ENTRY"] },
        ];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const picker = wrapper.get(".label-picker");
    const toggle = wrapper.get(".picker-chevron");
    expect(picker.classes()).not.toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");
    expect(picker.classes()).toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('.label-picker-menu [role="option"]')).toHaveLength(3);

    const labelButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]'));
    labelButtons[1].click();
    await flushPromises();
    expect(
      document.querySelector('.label-picker-menu [role="option"][aria-selected="true"]'),
    ).toBeTruthy();
    expect(document.querySelectorAll('.label-picker-menu [role="option"][aria-selected="true"]')).toHaveLength(1);
    await toggle.trigger("click");
    expect(picker.classes()).not.toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(document.querySelector(".label-picker-menu")).toBeNull();

    await toggle.trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(picker.classes()).not.toContain("is-open");
    wrapper.unmount();
  });

  it("suggests matching existing labels and selects them from the picker", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Focus path", status: "ACTIVE", color: "#e85d75" }];
      if (path === "/labels?scope=TIME_ENTRY")
        return [
          { id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] },
          { id: "label-2", name: "Review", scopes: ["TIME_ENTRY"] },
        ];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    useTimerStore().pathId = "path-1";
    await nextTick();

    await wrapper.get(".picker-chevron").trigger("click");
    const input = document.querySelector<HTMLInputElement>('.label-picker-menu input[aria-label="Search session labels"]')!;
    input.value = "vie";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(document.querySelector('.label-picker-menu [role="listbox"]')).not.toBeNull();
    expect([...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
      .some((option) => option.textContent?.includes("Review"))).toBe(true);

    [...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
      .find((option) => option.textContent?.includes("Review"))?.click();
    await flushPromises();

    expect([...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
      .some((option) => option.textContent?.includes("Review") && option.getAttribute("aria-selected") === "true")).toBe(true);
    wrapper.unmount();
  });

  it("allows selecting and unselecting a label from the picker", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/labels?scope=TIME_ENTRY")
        return [
          { id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] },
          { id: "label-2", name: "Review", scopes: ["TIME_ENTRY"] },
        ];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    const picker = wrapper.get(".label-picker");
    expect(picker.classes()).not.toContain("is-open");
    await wrapper.get(".picker-chevron").trigger("click");
    document.querySelector<HTMLButtonElement>('.label-picker-menu [role="option"]')?.click();
    await flushPromises();
    expect(picker.classes()).toContain("is-open");

    await wrapper.get(".picker-chevron").trigger("click");
    document.querySelector<HTMLButtonElement>('.label-picker-menu [role="option"]')?.click();
    await flushPromises();
    expect(document.querySelectorAll('.label-picker-menu [role="option"][aria-selected="true"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it("opens labels when the empty area inside the picker is clicked", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [];
      if (path === "/labels?scope=TIME_ENTRY")
        return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] }];
      if (path === "/timers/current") return null;
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const picker = wrapper.get(".label-picker");
    expect(picker.classes()).not.toContain("is-open");
    await wrapper.get(".label-picker-control").trigger("click");
    expect(picker.classes()).toContain("is-open");
    wrapper.unmount();
  });

  it("shows the running status and label names without showing the timer description", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Knowledge Base", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY")
        return [
          { id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] },
          { id: "label-2", name: "Review", scopes: ["TIME_ENTRY"] },
        ];
      if (path === "/timers/current")
        return {
          id: "timer-1",
          pathId: "path-1",
          labelIds: ["label-1", "label-2"],
          description: "Read chapter",
          startedAt: new Date().toISOString(),
          running: true,
        };
      return [];
    });
    const wrapper = mount(FloatingTimeTracker, {
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    expect(wrapper.get("button.floating-tracker-action").classes()).toContain(
      "is-running",
    );
    expect(
      wrapper.get("button.floating-tracker-action").attributes("aria-label"),
    ).toBe("Stop timer");
    expect(wrapper.get(".floating-tracker-clock").classes()).toContain(
      "is-running",
    );
    expect(wrapper.get(".floating-tracker-path").text()).toBe("Knowledge Base");
    expect(wrapper.get(".floating-tracker-context").text()).toContain(
      "Focus, Review",
    );
    expect(wrapper.get(".floating-tracker-context").text()).not.toContain(
      "Knowledge Base",
    );
    expect(wrapper.find(".floating-tracker-summary").exists()).toBe(false);
    wrapper.unmount();
  });

  it("edits the timer start time from the unchanged clock control", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
        if (path === "/timers/current")
          return {
            id: "timer-1",
            startedAt: "2026-09-11T10:00:00Z",
            running: true,
          };
        if (path === "/timers/timer-1" && options.method === "PUT")
          return {
            id: "timer-1",
            startedAt: "2026-09-11T09:30:00Z",
            running: true,
          };
        return [];
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    await wrapper.get(".floating-tracker-clock").trigger("click");
    expect(
      wrapper.get('input[aria-label="Started at"]').attributes("type"),
    ).toBe("datetime-local");
    await wrapper
      .get('input[aria-label="Started at"]')
      .setValue("2026-09-11T09:30");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"startedAt":"2026-09-11T09:30:00.000Z"'),
      }),
    );
    wrapper.unmount();
  });

  it("persists a newly created label and ignores an older polling response", async () => {
    vi.useFakeTimers();
    let resolveStalePoll: ((value: unknown) => void) | undefined;
    let currentRequests = 0;
    vi.mocked(api).mockImplementation(
      (path: string, options: RequestInit = {}) => {
        if (path === "/paths") return Promise.resolve([]);
        if (path === "/labels?scope=TIME_ENTRY") return Promise.resolve([]);
        if (path === "/labels") {
          return options.method === "POST"
            ? Promise.resolve({ id: "label-1", name: "Focus" })
            : Promise.resolve([]);
        }
        if (path === "/timers/current") {
          currentRequests++;
          if (currentRequests === 1)
            return Promise.resolve({
              id: "timer-1",
              labelIds: [],
              startedAt: "2026-09-11T10:00:00Z",
              running: true,
            });
          return new Promise((resolve) => {
            resolveStalePoll = resolve;
          });
        }
        if (path === "/timers/timer-1" && options.method === "PUT")
          return Promise.resolve({
            id: "timer-1",
            labelIds: ["label-1"],
            startedAt: "2026-09-11T10:00:00Z",
            running: true,
          });
        return Promise.resolve(undefined);
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000);

    await wrapper.get(".picker-chevron").trigger("click");
    const createInput = document.querySelector<HTMLInputElement>('.label-picker-menu input[aria-label="Search session labels"]')!;
    createInput.value = "Focus";
    createInput.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('.label-picker-menu [role="option"]')]
      .find((option) => option.id.endsWith("option-create"))?.click();
    await flushPromises();
    resolveStalePoll?.({
      id: "timer-1",
      labelIds: [],
      startedAt: "2026-09-11T10:00:00Z",
      running: true,
    });
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/timers/timer-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"labelIds":["label-1"]'),
      }),
    );
    expect(wrapper.find(".label-picker .selected-chip").exists()).toBe(true);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("does not let an older initial timer response overwrite WebSocket state", async () => {
    const originalWebSocket = globalThis.WebSocket;
    const sockets: MockSocket[] = [];
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {
        this.onclose?.();
      }
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    let resolveCurrent: ((value: unknown) => void) | undefined;
    vi.mocked(api).mockImplementation((path: string) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY")
        return Promise.resolve([]);
      if (path === "/timers/current")
        return new Promise((resolve) => {
          resolveCurrent = resolve;
        });
      return Promise.resolve(undefined);
    });

    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    sockets[0].onopen?.();
    sockets[0].onmessage?.({ data: '{"type":"READY"}' });
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: "TIMER_STATE",
        timer: {
          id: "timer-1",
          startedAt: "2026-09-12T10:00:00Z",
          running: true,
        },
      }),
    });
    resolveCurrent?.(null);
    await flushPromises();

    expect(
      wrapper.get("button.floating-tracker-action").attributes("aria-label"),
    ).toBe("Stop timer");
    expect(wrapper.get("button.floating-tracker-action").classes()).toContain(
      "is-running",
    );
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: "TIMER_STATE",
        timer: {
          id: "timer-1",
          startedAt: "2026-09-12T10:00:00Z",
          endedAt: "2026-09-12T10:30:00Z",
          running: false,
        },
      }),
    });
    await flushPromises();
    expect(
      wrapper.get("button.floating-tracker-action").attributes("aria-label"),
    ).toBe("Start timer");
    expect(
      wrapper.get("button.floating-tracker-action").classes(),
    ).not.toContain("is-running");
    expect(wrapper.emitted("changed")).toHaveLength(2);
    wrapper.unmount();
    localStorage.removeItem("know_token");
    globalThis.WebSocket = originalWebSocket;
  });

  it("recovers by polling during socket loss and refreshes again after reconnect", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const originalWebSocket = globalThis.WebSocket;
    const sockets: MockSocket[] = [];
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {}
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    const timer = (description: string) => ({
      id: "timer-live",
      labelIds: [],
      description,
      startedAt: "2026-10-10T09:59:00Z",
      running: true,
    });
    let currentReads = 0;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") {
        currentReads += 1;
        if (currentReads === 1) return null;
        return currentReads === 2 ? timer("Recovered by polling") : timer("Refreshed after reconnect");
      }
      if (path === "/timers/draft") return {};
      return undefined;
    });

    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    try {
      await flushPromises();
      expect(sockets).toHaveLength(1);
      sockets[0].onclose?.();
      await flushPromises();
      expect(wrapper.get('button[aria-label="Stop timer"]').exists()).toBe(true);
      expect(useTimerStore().description).toBe("Recovered by polling");

      await vi.advanceTimersByTimeAsync(5_000);
      expect(sockets).toHaveLength(2);
      sockets[1].onopen?.();
      sockets[1].onmessage?.({ data: '{"type":"READY"}' });
      await flushPromises();
      expect(useTimerStore().description).toBe("Refreshed after reconnect");
      expect(currentReads).toBeGreaterThanOrEqual(3);
      expect(
        vi.mocked(api).mock.calls.some(
          ([path, options]) => path === "/timers" && options?.method === "POST",
        ),
      ).toBe(false);
    } finally {
      wrapper.unmount();
      localStorage.removeItem("know_token");
      globalThis.WebSocket = originalWebSocket;
      vi.useRealTimers();
    }
  });

  it("keeps local timer fields when a live snapshot omits unchanged values", async () => {
    const originalWebSocket = globalThis.WebSocket;
    const sockets: MockSocket[] = [];
    class MockSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {
        this.onclose?.();
      }
    }
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    localStorage.setItem("know_token", "test-token");
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current")
        return {
          id: "timer-1",
          pathId: "path-1",
          description: "Read chapter",
          startedAt: new Date().toISOString(),
          running: true,
        };
      return undefined;
    });
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    sockets[0].onopen?.();
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: "TIMER_STATE",
        timer: {
          id: "timer-1",
          startedAt: new Date().toISOString(),
          running: true,
        },
      }),
    });
    await flushPromises();

    expect(
      wrapper.get('textarea[aria-label="Timer description"]').element,
    ).toHaveProperty("value", "Read chapter");
    expect(wrapper.get(".floating-tracker-path").text()).toBe("Study");
    const description = wrapper.get('textarea[aria-label="Timer description"]');
    (description.element as HTMLTextAreaElement).value =
      "Unfinished local typing";
    await description.trigger("input");
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: "TIMER_STATE",
        timer: {
          id: "timer-1",
          pathId: "path-1",
          description: "Read chapter",
          startedAt: new Date().toISOString(),
          running: true,
        },
      }),
    });
    await flushPromises();
    expect(description.element).toHaveProperty(
      "value",
      "Unfinished local typing",
    );
    wrapper.unmount();
    localStorage.removeItem("know_token");
    globalThis.WebSocket = originalWebSocket;
  });

  it("rehydrates the timer form after the tracker is remounted", async () => {
    const current = {
      id: "timer-1",
      pathId: "path-1",
      labelIds: ["label-1"],
      description: "Read chapter",
      startedAt: "2026-09-12T10:00:00Z",
      running: true,
    };
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths")
        return [{ id: "path-1", name: "Study", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY")
        return [{ id: "label-1", name: "Focus", scopes: ["TIME_ENTRY"] }];
      if (path === "/timers/current") return current;
      return undefined;
    });
    const first = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    first.unmount();

    const second = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();

    expect(second.get(".tracker-path-select").text()).toContain("Study");
    expect(second.find(".label-picker .selected-chip").exists()).toBe(true);
    expect(
      second.get('textarea[aria-label="Timer description"]').element,
    ).toHaveProperty("value", "Read chapter");
    second.unmount();
  });

  it("queues edits made during a save and preserves typing beyond the submitted snapshot", async () => {
    const current = {
      id: "timer-1",
      description: "Original",
      labelIds: [],
      startedAt: "2026-09-11T10:00:00Z",
      running: true,
    };
    const pending: { resolve: (value: unknown) => void; body: any }[] = [];
    vi.mocked(api).mockImplementation(
      (path: string, options: RequestInit = {}) => {
        if (path === "/timers/current") return Promise.resolve(current);
        if (options.method === "PUT")
          return new Promise((resolve) =>
            pending.push({ resolve, body: JSON.parse(options.body as string) }),
          );
        return Promise.resolve([]);
      },
    );
    const wrapper = mount(FloatingTimeTracker, {
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    const description = wrapper.get("textarea");
    await description.setValue("First edit");
    await description.setValue("Second edit");
    expect(pending).toHaveLength(1);
    pending[0].resolve({ ...current, ...pending[0].body });
    await flushPromises();
    expect(description.element).toHaveProperty("value", "Second edit");
    expect(pending).toHaveLength(2);
    expect(pending[1].body.description).toBe("Second edit");
    pending[1].resolve({ ...current, ...pending[1].body });
    await flushPromises();
    wrapper.unmount();
  });
});
