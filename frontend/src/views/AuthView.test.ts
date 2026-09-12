import { flushPromises, mount } from "@vue/test-utils";
import AuthView from "./AuthView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import { applyTheme } from "../lib/theme";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

type GoogleTestWindow = Window &
  typeof globalThis & {
    google?: {
      accounts: {
        id: {
          initialize: ReturnType<typeof vi.fn>;
          renderButton: ReturnType<typeof vi.fn>;
        };
      };
    };
  };

const testWindow = window as GoogleTestWindow;

describe("AuthView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => {
    applyTheme("light");
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete testWindow.google;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete testWindow.google;
  });

  it("registers, persists the token, and emits authentication", async () => {
    vi.mocked(api).mockResolvedValue({ token: "test-token" });
    const wrapper = mount(AuthView);

    await wrapper.find(".text-button").trigger("click");
    await wrapper.get('input[type="email"]').setValue("learner@example.com");
    await wrapper.get('input[type="password"]').setValue("a-secure-password");
    await wrapper.get("form").trigger("submit");

    expect(api).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(localStorage.getItem("know_token")).toBe("test-token");
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("shows an actionable error when authentication fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("bad credentials"));
    const wrapper = mount(AuthView);

    await wrapper.get('input[type="email"]').setValue("learner@example.com");
    await wrapper.get('input[type="password"]').setValue("a-secure-password");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.get('[role="alert"]').text()).toContain("valid email");
    expect(wrapper.emitted("authenticated")).toBeUndefined();
  });

  it("toggles cleanly between sign-in and registration modes", async () => {
    const wrapper = mount(AuthView);
    expect(wrapper.get("h1").text()).toBe("Welcome back");
    await wrapper.get("button.text-button").trigger("click");
    expect(wrapper.get("h1").text()).toBe("Create account");
    expect(wrapper.get("button.primary").text()).toContain("Create account");
    await wrapper.get("button.text-button").trigger("click");
    expect(wrapper.get("h1").text()).toBe("Welcome back");
    expect(wrapper.get("button.primary").text()).toContain("Sign in");
  });

  it("posts Google credentials to the backend verifier", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    vi.mocked(api).mockResolvedValue({ token: "google-token" });
    let callback: ((response: { credential: string }) => void) | undefined;
    testWindow.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            callback = options.callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };

    const wrapper = mount(AuthView);
    callback?.({ credential: "signed-google-id-token" });
    await flushPromises();

    expect(testWindow.google?.accounts.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "google-client-id" }),
    );
    expect(testWindow.google?.accounts.id.renderButton).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith(
      "/auth/google",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "signed-google-id-token" }),
      }),
    );
    expect(localStorage.getItem("know_token")).toBe("google-token");
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("renders Google sign-in when the GIS script loads after the view", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    const renderButton = vi.fn();
    testWindow.google = undefined;
    const script = document.createElement("script");
    script.id = "google-gsi-client";
    document.body.appendChild(script);

    const wrapper = mount(AuthView);
    testWindow.google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton,
        },
      },
    };
    script.dispatchEvent(new Event("load"));
    await wrapper.vm.$nextTick();

    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ width: 320 }),
    );
    wrapper.unmount();
    script.remove();
  });

  it("adapts configured Google sign-in to the theme and available width", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    const renderButton = vi.fn();
    const initialize = vi.fn();
    testWindow.google = { accounts: { id: { initialize, renderButton } } };
    const wrapper = mount(AuthView);
    const host = wrapper.get('[aria-label="Continue with Google"]').element;
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 254 });
    applyTheme("dark");
    await wrapper.vm.$nextTick();
    expect(renderButton).toHaveBeenLastCalledWith(host, expect.objectContaining({ theme: "filled_black", width: 254 }));
    applyTheme("light");
    await wrapper.vm.$nextTick();
    expect(renderButton).toHaveBeenLastCalledWith(host, expect.objectContaining({ theme: "outline", width: 254 }));
    expect(initialize).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("shows a recoverable error when Google verification fails", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    vi.mocked(api).mockRejectedValue(new Error("verification failed"));
    let callback: ((response: { credential: string }) => void) | undefined;
    testWindow.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => { callback = options.callback; }),
          renderButton: vi.fn(),
        },
      },
    };
    const wrapper = mount(AuthView);
    callback?.({ credential: "bad-google-id-token" });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Google sign-in could not be completed. Try again.");
    expect(wrapper.emitted("authenticated")).toBeUndefined();
  });
});
