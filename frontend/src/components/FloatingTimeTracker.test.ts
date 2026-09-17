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

  it("keeps labels in one row until the label chevron expands the chip list", async () => {
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
    const toggle = wrapper.get(".label-picker-toggle");
    expect(picker.classes()).not.toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(
      wrapper.find('input[aria-label="New session label name"]').exists(),
    ).toBe(true);

    await toggle.trigger("click");
    expect(picker.classes()).toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#tt-label-options").findAll("button")).toHaveLength(3);

    const labelButtons = wrapper.get("#tt-label-options").findAll("button");
    await labelButtons[1].trigger("click");
    await flushPromises();
    expect(
      wrapper.get("#tt-label-options").find("button.selected").exists(),
    ).toBe(true);
    expect(wrapper.get(".tracker-field-heading > span").text()).toBe(
      "3 available · 1 selected",
    );
    await toggle.trigger("click");
    expect(picker.classes()).not.toContain("is-open");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    const closedLabelButtons = wrapper
      .get("#tt-label-options")
      .findAll("button");
    expect(closedLabelButtons).toHaveLength(3);
    expect(closedLabelButtons.map((button) => button.text())).toEqual([
      "Review×",
      "Focus",
      "Planning",
    ]);
    expect(closedLabelButtons[0].classes()).toContain("selected");

    await toggle.trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(picker.classes()).not.toContain("is-open");
    wrapper.unmount();
  });

  it("expands the labels picker when a collapsed label is selected or unselected", async () => {
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
    (
      wrapper.get("#tt-label-options button").element as HTMLButtonElement
    ).click();
    await flushPromises();
    expect(picker.classes()).toContain("is-open");

    await wrapper.get(".label-picker-toggle").trigger("click");
    expect(picker.classes()).not.toContain("is-open");
    (
      wrapper.get("#tt-label-options button").element as HTMLButtonElement
    ).click();
    await flushPromises();
    expect(picker.classes()).toContain("is-open");
    expect(
      wrapper.get("#tt-label-options button").attributes("aria-pressed"),
    ).toBe("false");
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
    await picker.trigger("click");
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

    await wrapper
      .get('input[aria-label="New session label name"]')
      .setValue("Focus");
    await wrapper.get(".create-label").trigger("click");
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
    expect(wrapper.get(".label-picker button").classes()).toContain("selected");
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

    expect(wrapper.get("button.floating-tracker-action").text()).toContain(
      "Stop session",
    );
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
    expect(wrapper.get("button.floating-tracker-action").text()).toContain(
      "Start a session",
    );
    expect(
      wrapper.get("button.floating-tracker-action").classes(),
    ).not.toContain("is-running");
    expect(wrapper.emitted("changed")).toHaveLength(2);
    wrapper.unmount();
    localStorage.removeItem("know_token");
    globalThis.WebSocket = originalWebSocket;
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
    expect(second.get(".label-picker button").classes()).toContain("selected");
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
