import { flushPromises, mount } from "@vue/test-utils";
import FloatingTimeTracker from "./FloatingTimeTracker.vue";
import { api } from "../lib/api";
import vuetify from "../plugins/vuetify";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("FloatingTimeTracker", () => {
  beforeEach(() => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/paths" || path === "/labels?scope=TIME_ENTRY" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/timers" && options.method === "POST") return { id: "timer-1", startedAt: new Date().toISOString(), running: true };
      return undefined;
    });
  });

  it("preserves Overview's ability to start without a path or label", async () => {
    const wrapper = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    await flushPromises();

    await wrapper.get("button.floating-tracker-action").trigger("click");
    await flushPromises();

    expect(vi.mocked(api)).toHaveBeenCalledWith("/timers", expect.objectContaining({ method: "POST" }));
    wrapper.unmount();
  });

  it("expands inline on Overview and starts collapsed as a dock elsewhere", async () => {
    const inline = mount(FloatingTimeTracker, { props: { inline: true }, global: { plugins: [vuetify] } });
    const floating = mount(FloatingTimeTracker, { global: { plugins: [vuetify] } });
    await flushPromises();
    expect(inline.get(".floating-tracker-host").classes()).toContain("inline");
    expect(floating.get(".floating-tracker-host").classes()).not.toContain("inline");
    expect(inline.find("#floating-tracker-panel").exists()).toBe(true);
    expect(floating.find("#floating-tracker-panel").exists()).toBe(false);
    expect(floating.get(".floating-tracker-toggle").attributes("aria-expanded")).toBe("false");

    await floating.get(".floating-tracker-toggle").trigger("click");
    expect(floating.find("#floating-tracker-panel").exists()).toBe(true);
    inline.unmount();
    floating.unmount();
  });
});
