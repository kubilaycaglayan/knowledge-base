import { flushPromises, mount } from "@vue/test-utils";
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("../lib/oauthAuthorization", () => ({ navigateToOAuthContinuation: navigateMock }));
import OAuthAccountView from "./OAuthAccountView.vue";

const stubs = {
  VApp: { template: "<div><slot /></div>" },
  VCard: { template: "<section><slot /></section>" },
  VCardTitle: { template: "<div><slot /></div>" },
  VCardText: { template: "<div><slot /></div>" },
  VBtn: { template: "<button v-bind='$attrs'><slot /></button>" },
};

it("shows the authenticated account and submits a CSRF-protected choice", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ email: "user@example.test", csrfParameter: "_csrf", csrfToken: "csrf", authorizationUrl: "/oauth2/authorize?state=test" }), { status: 200 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();
  expect(wrapper.text()).toContain("user@example.test");
  expect(wrapper.get("form").attributes("action")).toBe("/connect/openai/account");
  expect(wrapper.get('input[name="_csrf"]').attributes("value")).toBe("csrf");
  expect(wrapper.findAll("button").map(button => button.attributes("value"))).toEqual(["continue", "switch"]);
  const continueClasses = wrapper.get('button[value="continue"]').classes();
  fetchSpy.mockRestore();
  expect(continueClasses).toContain("primary");
});

it("posts the account choice as JSON and explicitly navigates to its continuation", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ email: "user@example.test", csrfParameter: "_csrf", csrfToken: "csrf", authorizationUrl: "/oauth2/authorize?state=test" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: "/oauth2/authorize?state=test" }), { status: 200 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();

  await wrapper.get("form").trigger("submit", { submitter: wrapper.findAll("button")[0].element });
  await flushPromises();

  expect(fetchSpy).toHaveBeenCalledTimes(2);
  const [url, options] = fetchSpy.mock.calls[1];
  expect(url).toBe("/connect/openai/account");
  expect(options).toMatchObject({
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    credentials: "same-origin",
    cache: "no-store",
  });
  expect(String(options?.body)).toContain("_csrf=csrf");
  expect(String(options?.body)).toContain("action=continue");
  expect(navigateMock).toHaveBeenCalledWith("/oauth2/authorize?state=test");
  fetchSpy.mockRestore();
  navigateMock.mockClear();
});

it("uses the captured continuation when the authorization bridge replaces the JSON response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ email: "user@example.test", csrfParameter: "_csrf", csrfToken: "csrf", authorizationUrl: "/oauth2/authorize?state=test" }), { status: 200 }))
    .mockResolvedValueOnce(new Response("<!doctype html><title>Continuing authorization</title>", {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();

  await wrapper.get("form").trigger("submit", { submitter: wrapper.findAll("button")[0].element });
  await flushPromises();

  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(fetchSpy.mock.calls[2][0]).toBe("/connect/openai/account-info");
  expect(navigateMock).toHaveBeenCalledWith("/oauth2/authorize?state=test");
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  fetchSpy.mockRestore();
  navigateMock.mockClear();
});

it("offers recovery when the pending connection has expired", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
  const wrapper = mount(OAuthAccountView, { global: { stubs } });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("Start the connection again");
  expect(wrapper.find("form").exists()).toBe(false);
  fetchSpy.mockRestore();
});
