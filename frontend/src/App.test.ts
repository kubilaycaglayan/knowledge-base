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
});
