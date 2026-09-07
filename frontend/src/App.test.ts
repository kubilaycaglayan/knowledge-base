import { mount } from "@vue/test-utils";
import App from "./App.vue";

const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  RouterView: { template: "<div data-test=router-view />" },
  AuthView: {
    emits: ["authenticated"],
    template: '<button data-test="authenticate" @click="$emit(\'authenticated\')">Authenticate</button>',
  },
};

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("shows authentication before a token exists", () => {
    const wrapper = mount(App, { global: { stubs } });

    expect(wrapper.find('[data-test="authenticate"]').exists()).toBe(true);
    expect(wrapper.find("nav").exists()).toBe(false);
    expect(wrapper.find('button.ghost').exists()).toBe(false);
  });

  it("shows the authenticated navigation and signs out", async () => {
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, { global: { stubs } });

    expect(wrapper.get("nav").findAll("a").map((link) => link.text())).toEqual([
      "Overview",
      "Sessions",
      "Paths",
      "Items",
      "Timeline",
      "Calendar",
      "Notes",
      "Reports",
      "Imports",
    ]);

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

  it("limits the workspace appearance and skip link to the authenticated overview", async () => {
    const { reactive } = await import("vue");
    const route = reactive({ path: "/" });
    localStorage.setItem("know_token", "token");
    const wrapper = mount(App, { global: { stubs, mocks: { $route: route } } });

    expect(wrapper.classes()).toContain("dashboard-shell");
    expect(wrapper.get(".dashboard-skip").attributes("href")).toBe("#main-content");
    expect(wrapper.get("#main-content").attributes("tabindex")).toBe("-1");

    for (const path of ["/paths", "/items", "/sessions", "/notes", "/reports", "/timeline", "/calendar", "/imports"]) {
      route.path = path;
      await wrapper.vm.$nextTick();
      expect(wrapper.classes()).not.toContain("dashboard-shell");
      expect(wrapper.find(".dashboard-skip").exists()).toBe(false);
      expect(wrapper.get("main").attributes("tabindex")).toBeUndefined();
    }

    route.path = "/";
    await wrapper.vm.$nextTick();
    await wrapper.get("button.ghost").trigger("click");
    expect(wrapper.classes()).not.toContain("dashboard-shell");
    expect(wrapper.find(".dashboard-skip").exists()).toBe(false);
    wrapper.unmount();
  });
});
