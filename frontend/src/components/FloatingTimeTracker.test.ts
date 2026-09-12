import { flushPromises, mount } from "@vue/test-utils";
import FloatingTimeTracker from "./FloatingTimeTracker.vue";
import { api } from "../lib/api";
import vuetify from "../plugins/vuetify";
import { createPinia, setActivePinia } from "pinia";
import { useReportsStore } from "../stores/reports";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("FloatingTimeTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/timers" && options.method === "POST") return { id: "timer-1", startedAt: new Date().toISOString(), running: true };
      return undefined;
    });
  });

  it("preserves Sessions' ability to start without a path or label", async () => {
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();

    await wrapper.get("button.floating-tracker-action").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers", expect.objectContaining({ method: "POST" }));
    wrapper.unmount();
  });

  it("invalidates reports and emits a change when a session is stopped", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return { id: "timer-1", startedAt: new Date().toISOString(), running: true };
      if (path === "/timers/timer-1/stop" && options.method === "POST") return undefined;
      return undefined;
    });
    const reports = useReportsStore();
    reports.set("week", { totalSeconds: 60 });
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();

    await wrapper.get("button.floating-tracker-action").trigger("click");
    await flushPromises();

    expect(reports.get("week")).toBeUndefined();
    expect(wrapper.emitted("changed")).toHaveLength(1);
    wrapper.unmount();
  });

  it("expands inline on Sessions and starts collapsed as a dock elsewhere", async () => {
    const inline = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    const floating = mount(FloatingTimeTracker, { global: { plugins: [vuetify] } });
    await flushPromises();
    expect(inline.get(".floating-tracker-host").classes()).toContain("inline");
    expect(floating.get(".floating-tracker-host").classes()).not.toContain("inline");
    expect(inline.find("#floating-tracker-panel").exists()).toBe(true);
    expect(inline.find(".floating-tracker-toggle").exists()).toBe(false);
    expect(floating.find("#floating-tracker-panel").exists()).toBe(false);
    expect(floating.get(".floating-tracker-toggle").attributes("aria-expanded")).toBe("false");
    expect(floating.get(".tracker-status").classes()).not.toContain("running");
    expect(floating.get(".tracker-status").attributes("aria-label")).toBe("No session running");

    await floating.get(".floating-tracker-toggle").trigger("click");
    expect(floating.find("#floating-tracker-panel").exists()).toBe(true);
    inline.unmount();
    floating.unmount();
  });

  it("shows the running status and label names without repeating the path in the collapsed dock", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths") return [{ id: "path-1", name: "Knowledge Base", status: "ACTIVE" }];
      if (path === "/labels?scope=TIME_ENTRY") return [{ id: "label-1", name: "Focus" }, { id: "label-2", name: "Review" }];
      if (path === "/timers/current") return { id: "timer-1", pathId: "path-1", labelIds: ["label-1", "label-2"], startedAt: new Date().toISOString(), running: true };
      return [];
    });
    const wrapper = mount(FloatingTimeTracker, { global: { plugins: [vuetify] } });
    await flushPromises();

    expect(wrapper.get(".tracker-status").classes()).toContain("running");
    expect(wrapper.get(".tracker-status").attributes("aria-label")).toBe("Session running");
    expect(wrapper.get(".floating-tracker-path").text()).toBe("Knowledge Base");
    expect(wrapper.get(".floating-tracker-context").text()).toContain("Focus, Review");
    expect(wrapper.get(".floating-tracker-context").text()).not.toContain("Knowledge Base");
    wrapper.unmount();
  });

  it("edits the timer start time from the unchanged clock control", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY") return [];
      if (path === "/timers/current") return { id: "timer-1", startedAt: "2026-09-11T10:00:00Z", running: true };
      if (path === "/timers/timer-1" && options.method === "PUT") return { id: "timer-1", startedAt: "2026-09-11T09:30:00Z", running: true };
      return [];
    });
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();
    await wrapper.get(".floating-tracker-clock").trigger("click");
    expect(wrapper.get('input[aria-label="Started at"]').attributes("type")).toBe("datetime-local");
    await wrapper.get('input[aria-label="Started at"]').setValue("2026-09-11T09:30");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers/timer-1", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"startedAt":"2026-09-11T09:30:00.000Z"') }));
    wrapper.unmount();
  });

  it("persists a newly created label and ignores an older polling response", async () => {
    vi.useFakeTimers();
    let resolveStalePoll: ((value: unknown) => void) | undefined;
    let currentRequests = 0;
    vi.mocked(api).mockImplementation((path: string, options: RequestInit = {}) => {
      if (path === "/paths") return Promise.resolve([]);
      if (path === "/labels?scope=TIME_ENTRY") return Promise.resolve([]);
      if (path === "/labels") {
        return options.method === "POST"
          ? Promise.resolve({ id: "label-1", name: "Focus" })
          : Promise.resolve([]);
      }
      if (path === "/timers/current") {
        currentRequests++;
        if (currentRequests === 1) return Promise.resolve({ id: "timer-1", labelIds: [], startedAt: "2026-09-11T10:00:00Z", running: true });
        return new Promise((resolve) => { resolveStalePoll = resolve; });
      }
      if (path === "/timers/timer-1" && options.method === "PUT") return Promise.resolve({ id: "timer-1", labelIds: ["label-1"], startedAt: "2026-09-11T10:00:00Z", running: true });
      return Promise.resolve(undefined);
    });
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000);

    await wrapper.get('input[aria-label="New session label name"]').setValue("Focus");
    await wrapper.get(".create-label").trigger("click");
    await flushPromises();
    resolveStalePoll?.({ id: "timer-1", labelIds: [], startedAt: "2026-09-11T10:00:00Z", running: true });
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers/timer-1", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"labelIds":["label-1"]') }));
    expect(wrapper.get(".label-picker button").classes()).toContain("selected");
    wrapper.unmount();
    vi.useRealTimers();
  });
});
