import { flushPromises, mount } from "@vue/test-utils";
import OAuthAccountView from "./OAuthAccountView.vue";

const stubs = {
  VApp: { template: "<div><slot /></div>" },
  VCard: { template: "<section><slot /></section>" },
  VCardTitle: { template: "<div><slot /></div>" },
  VCardText: { template: "<div><slot /></div>" },
  VBtn: { template: "<button v-bind='$attrs'><slot /></button>" },
};

it("shows the authenticated account and submits a CSRF-protected choice", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ email: "user@example.test", csrfParameter: "_csrf", csrfToken: "csrf" }), { status: 200 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();
  expect(wrapper.text()).toContain("user@example.test");
  expect(wrapper.get("form").attributes("action")).toBe("/connect/openai/account");
  expect(wrapper.get('input[name="_csrf"]').attributes("value")).toBe("csrf");
  expect(wrapper.findAll("button").map(button => button.attributes("value"))).toEqual(["continue", "switch"]);
  fetchSpy.mockRestore();
});

it("offers recovery when the pending connection has expired", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("Start the connection again");
  expect(wrapper.find("form").exists()).toBe(false);
  fetchSpy.mockRestore();
});
