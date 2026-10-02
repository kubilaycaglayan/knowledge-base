import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { routeLocationKey, routerKey } from "vue-router";
import App from "./App.vue";
import { clearWarmupCooldown, scheduleWarmup } from "./lib/warmup";

const cancel = vi.fn();
vi.mock("./lib/warmup", () => ({
  scheduleWarmup: vi.fn(() => ({ cancel, done: Promise.resolve() })),
  clearWarmupCooldown: vi.fn(),
  routeChunkTasks: vi.fn(() => []),
  pageDataTasks: vi.fn(() => []),
}));

const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  RouterView: { template: "<div />" },
  FloatingTimeTracker: { template: "<aside />" },
  AppSnackbar: { template: "<div />" },
  AuthView: { template: "<div />" },
};

describe("App navigation warm-up", () => {
  const nativeWebSocket = globalThis.WebSocket;
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    globalThis.WebSocket = undefined as unknown as typeof WebSocket;
    setActivePinia(createPinia());
  });
  afterEach(() => {
    globalThis.WebSocket = nativeWebSocket;
  });

  it("WU-11: starts the warm-up for a signed-in user and cancels it on sign-out", async () => {
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, {
      global: {
        stubs,
        provide: {
          [routeLocationKey as symbol]: { path: "/paths", query: {} },
          [routerKey as symbol]: { getRoutes: () => [], replace: vi.fn() },
        },
      },
    });
    expect(scheduleWarmup).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    await wrapper.get("button.ghost").trigger("click");

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(clearWarmupCooldown).toHaveBeenCalledTimes(1);
    expect(scheduleWarmup).toHaveBeenCalledTimes(1);
  });

  it("does not warm up before sign-in", () => {
    mount(App, { global: { stubs } });
    expect(scheduleWarmup).not.toHaveBeenCalled();
  });
});
