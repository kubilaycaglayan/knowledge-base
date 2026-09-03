import { mount } from "@vue/test-utils";
import AuthView from "./AuthView.vue";
import { api } from "../lib/api";

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
  beforeEach(() => {
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
    await Promise.resolve();

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
});
