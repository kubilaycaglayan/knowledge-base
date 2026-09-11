import { flushPromises, mount } from "@vue/test-utils";
import DashboardView from "./DashboardView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const timerStub = {
  emits: ["changed"],
  props: ["inline"],
  template: '<button data-test="timer" @click="$emit(\'changed\')">Timer</button>',
};

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/paths" || path === "/calendar/labels") return [];
      if (path === "/timers/current") return null;
      if (path === "/statistics") return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByLabel: {}, weekByPath: {}, weekByLabel: {} };
      if (path === "/time-entries") return [];
      return undefined;
    });
  });

  it("replaces the legacy session workspace with the inline tracker", async () => {
    const wrapper = mount(DashboardView, { global: { stubs: { FloatingTimeTracker: timerStub } } });
    await flushPromises();
    expect(wrapper.find('[data-test="timer"]').exists()).toBe(true);
    expect(wrapper.find(".session-workspace").exists()).toBe(false);
  });

  it("refreshes overview data after a timer mutation", async () => {
    const wrapper = mount(DashboardView, { global: { stubs: { FloatingTimeTracker: timerStub } } });
    await flushPromises();
    vi.mocked(api).mockClear();
    await wrapper.get('[data-test="timer"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/statistics");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/time-entries");
  });
});
