import { flushPromises, mount } from "@vue/test-utils";
import SettingsView from "./SettingsView.vue";
import { api, download } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn(), download: vi.fn() }));

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: false, hasGoogle: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows only the selected settings section", async () => {
    const wrapper = mount(SettingsView);
    await flushPromises();

    expect(wrapper.text()).toContain("Sign-in methods");
    expect((wrapper.get(".theme-select").element as HTMLSelectElement).value).toBe("auto");
    expect(wrapper.text()).not.toContain("Download Knowledge Base CSV");
    await wrapper.get('[role="tab"]:nth-child(3)').trigger("click");
    expect(wrapper.text()).toContain("Download Knowledge Base CSV");
    expect(wrapper.text()).not.toContain("Sign-in methods");
  });

  it("downloads a Knowledge Base CSV from the Export tab", async () => {
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('[role="tab"]:nth-child(3)').trigger("click");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(download)).toHaveBeenCalledWith(
      "/imports/knowledge-base/export",
      "knowledge-base-export.csv",
    );
    expect(wrapper.text()).toContain("Your Knowledge Base export is ready.");
  });

  it("requires the current password for accounts that also use Google sign-in", async () => {
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: true, hasGoogle: true });
    const wrapper = mount(SettingsView);
    await flushPromises();

    expect(wrapper.get('input[name="currentPassword"]').attributes("autocomplete")).toBe("current-password");
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("new-password");
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: true, hasGoogle: true });
    await wrapper.get("form").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/auth/password", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password" }),
    }));
  });

  it("marks the change form for browser password managers", async () => {
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: true, hasGoogle: false });
    const wrapper = mount(SettingsView);
    await flushPromises();

    const form = wrapper.get("#password-change-form");
    expect(form.attributes()).toMatchObject({ action: "/settings", autocomplete: "on", method: "post" });
    expect(form.get('input[name="username"]').attributes()).toMatchObject({ autocomplete: "username", type: "hidden" });
    expect((form.get('input[name="username"]').element as HTMLInputElement).value).toBe("person@example.com");
    expect(form.get("#current-password").attributes("autocomplete")).toBe("current-password");
    expect(form.get("#new-password").attributes("autocomplete")).toBe("new-password");
    expect(form.get("#confirm-password").attributes("autocomplete")).toBe("new-password");
  });

  it("offers the changed password to browser credential storage after success", async () => {
    const store = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "credentials", { configurable: true, value: { store } });
    class PasswordCredentialMock {
      id: string;
      password: string;

      constructor(value: { id: string; password: string }) {
        this.id = value.id;
        this.password = value.password;
      }
    }
    vi.stubGlobal("PasswordCredential", PasswordCredentialMock);
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: true, hasGoogle: false });
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("new-password");

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(store).toHaveBeenCalledWith(expect.objectContaining({ id: "person@example.com", password: "new-password" }));
    expect(store.mock.calls[0][0]).toBeInstanceOf(PasswordCredentialMock);
  });

  it("rejects mismatched new passwords before calling the API", async () => {
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: true, hasGoogle: false });
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("different-password");

    await wrapper.get("form").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toContain("Passwords do not match");
  });
});
