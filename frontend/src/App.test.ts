import { mount } from "@vue/test-utils";
import App from "./App.vue";
import { routeLocationKey, routerKey } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  RouterView: { template: "<div data-test=router-view />" },
  FloatingTimeTracker: { template: "<aside data-test= floating-tracker />" },
  AuthView: {
    emits: ["authenticated"],
    template: '<button data-test="authenticate" @click="$emit(\'authenticated\')">Authenticate</button>',
  },
};

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("shows authentication before a token exists", () => {
    const wrapper = mount(App, { global: { stubs } });

    expect(wrapper.find('[data-test="authenticate"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="floating-tracker"]').exists()).toBe(false);
    expect(wrapper.find("nav").exists()).toBe(false);
    expect(wrapper.find('button.ghost:not(.theme-toggle)').exists()).toBe(false);
    expect(wrapper.find(".settings-link").exists()).toBe(false);
    expect(wrapper.find(".theme-toggle svg").exists()).toBe(true);
  });

  it("lets logged-out users change the theme from the shell", async () => {
    const wrapper = mount(App, { global: { stubs } });

    await wrapper.get(".theme-toggle").trigger("click");

    expect(localStorage.getItem("knowledge-base-theme")).not.toBeNull();
    expect(wrapper.get(".theme-toggle").attributes("aria-label")).toContain("Switch to");
  });

  it("shows the authenticated navigation and signs out", async () => {
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, {
      global: {
        stubs,
        provide: { [routeLocationKey as symbol]: { path: "/paths", query: {} } },
      },
    });

    expect(wrapper.get("nav").findAll("a").map((link) => link.text())).toEqual([
      "Sessions",
      "Paths",
      "Calendar",
      "Notes",
      "Reports",
      "Labels",
    ]);
    expect(wrapper.get('.settings-link').attributes('aria-label')).toBe('Settings');
    expect(wrapper.find(".theme-toggle").exists()).toBe(false);
    expect(wrapper.find('[data-test="floating-tracker"]').exists()).toBe(true);

    await wrapper.get("button.ghost").trigger("click");

    expect(localStorage.getItem("know_token")).toBeNull();
    expect(wrapper.find("nav").exists()).toBe(false);
    expect(wrapper.find('[data-test="authenticate"]').exists()).toBe(true);
  });

  it("switches to the authenticated shell after login", async () => {
    const wrapper = mount(App, { global: { stubs } });

    localStorage.setItem("know_token", "new-token");
    await wrapper.get('[data-test="authenticate"]').trigger("click");

    expect(wrapper.find("nav").exists()).toBe(true);
    expect(wrapper.find("button.ghost").text()).toBe("Sign out");
  });

  it("redirects sign-in to Sessions by default", async () => {
    const replace = vi.fn();
    const wrapper = mount(App, {
      global: {
        stubs,
        provide: { [routerKey as symbol]: { replace } },
      },
    });

    await wrapper.get('[data-test="authenticate"]').trigger("click");

    expect(replace).toHaveBeenCalledWith("/sessions");
  });

  it("honors a safe internal redirect after sign-in", async () => {
    const replace = vi.fn();
    const wrapper = mount(App, {
      global: {
        stubs,
        provide: {
          [routeLocationKey as symbol]: { path: "/auth", query: { redirect: "/settings" } },
          [routerKey as symbol]: { replace },
        },
      },
    });

    await wrapper.get('[data-test="authenticate"]').trigger("click");

    expect(replace).toHaveBeenCalledWith("/settings");
  });

  it("ignores external redirect values", async () => {
    const replace = vi.fn();
    const wrapper = mount(App, {
      global: {
        stubs,
        provide: {
          [routeLocationKey as symbol]: { path: "/auth", query: { redirect: "https://evil.example" } },
          [routerKey as symbol]: { replace },
        },
      },
    });

    await wrapper.get('[data-test="authenticate"]').trigger("click");

    expect(replace).toHaveBeenCalledWith("/sessions");
  });

  it("shares the workspace appearance and skip link across every page and authentication", async () => {
    const { reactive } = await import("vue");
    const route = reactive({ path: "/" });
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, { global: { stubs, mocks: { $route: route } } });

    expect(wrapper.classes()).toContain("dashboard-shell");
    expect(wrapper.get(".dashboard-skip").attributes("href")).toBe("#main-content");
    expect(wrapper.get("#main-content").attributes("tabindex")).toBe("-1");

    for (const path of ["/paths", "/sessions", "/notes", "/reports", "/timeline", "/calendar", "/imports"]) {
      route.path = path;
      await wrapper.vm.$nextTick();
      expect(wrapper.classes()).toContain("dashboard-shell");
      expect(wrapper.find(".dashboard-skip").exists()).toBe(true);
      expect(wrapper.get("main").attributes("tabindex")).toBe("-1");
    }

    route.path = "/";
    await wrapper.vm.$nextTick();
    await wrapper.get("button.ghost").trigger("click");
    expect(wrapper.classes()).toContain("dashboard-shell");
    expect(wrapper.find(".dashboard-skip").exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not mount the floating tracker on the sessions page", async () => {
    const { reactive } = await import("vue");
    const route = reactive({ path: "/paths", query: {} });
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, { global: { stubs, provide: { [routeLocationKey as symbol]: route } } });
    const tracker = wrapper.find('[data-test="floating-tracker"]');

    expect(tracker.exists()).toBe(true);
    expect(tracker.attributes("style") || "").not.toContain("display: none");

    route.path = "/sessions";
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="floating-tracker"]').exists()).toBe(false);

    route.path = "/calendar";
    await wrapper.vm.$nextTick();
    const restoredTracker = wrapper.find('[data-test="floating-tracker"]');
    expect(restoredTracker.exists()).toBe(true);
    expect(restoredTracker.attributes("style") || "").not.toContain("display: none");
    expect(restoredTracker.element).not.toBe(tracker.element);
    wrapper.unmount();
  });
});
