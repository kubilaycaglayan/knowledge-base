import { config, flushPromises, mount } from "@vue/test-utils";
import SettingsView from "./SettingsView.vue";
import { api, download } from "../lib/api";
import { setThemePreference, themePreference } from "../lib/theme";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../lib/api", () => ({ api: vi.fn(), download: vi.fn() }));

config.global.stubs = {
  VDialog: {
    props: ["modelValue"],
    template: '<div v-if="modelValue" class="v-dialog-stub"><slot /></div>',
  },
};

describe("SettingsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/auth/me"
        ? { email: "person@example.com", hasPassword: false, hasGoogle: true }
        : [],
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows only the selected settings section", async () => {
    const wrapper = mount(SettingsView);
    await flushPromises();

    expect(wrapper.text()).toContain("Sign-in methods");
    expect(wrapper.get(".account-summary strong").text()).toBe("person@example.com");
    expect(
      (wrapper.get(".theme-select").element as HTMLSelectElement).value,
    ).toBe("auto");
    expect(wrapper.text()).not.toContain("Download Knowledge Base CSV");
    await wrapper.get('[role="tab"][aria-controls="settings-panel-data"]').trigger("click");
    expect(wrapper.get('[role="tabpanel"]').text()).toContain("Import Knowledge Base CSV files");
    await wrapper.get('[role="tab"][aria-controls="settings-panel-export"]').trigger("click");
    expect(wrapper.text()).toContain("Download Knowledge Base CSV");
    expect(wrapper.text()).not.toContain("Sign-in methods");
  });

  it("updates and persists the appearance preference immediately", async () => {
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get(".theme-select").setValue("dark");

    expect(themePreference.value).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("knowledge-base-theme")).toBe("dark");
    expect((wrapper.get(".theme-select").element as HTMLSelectElement).value).toBe("dark");

    setThemePreference("auto");
    await wrapper.unmount();
  });

  it("downloads a Knowledge Base CSV from the Export tab", async () => {
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('[role="tab"][aria-controls="settings-panel-export"]').trigger("click");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(vi.mocked(download)).toHaveBeenCalledWith(
      "/imports/knowledge-base/export",
      "knowledge-base-export.csv",
    );
    expect(wrapper.text()).toContain("Your Knowledge Base export is ready.");
  });

  it("reports an export failure without claiming a file was downloaded", async () => {
    vi.mocked(download).mockRejectedValue(new Error("offline"));
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('[role="tab"][aria-controls="settings-panel-export"]').trigger("click");
    await wrapper.get("button.primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toBe("Could not export your data. Try again.");
  });

  it("creates a scoped MCP token and displays its secret only in the creation result", async () => {
    const token = { id: "token-1", name: "Codex", categories: ["notes"], createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-02-01T00:00:00Z", lastUsedAt: null };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/auth/me") return { email: "person@example.com", hasPassword: false, hasGoogle: true };
      if (path === "/mcp-tokens" && options?.method !== "POST") return [];
      if (path === "/mcp-tokens/token-1" && options?.method === "DELETE") return undefined;
      return { token, secret: "kb_mcp_one_time_secret" };
    });
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          VBtn: {
            props: ["color", "variant", "size", "prependIcon"],
            template: '<button type="button" :data-color="color" :data-variant="variant"><slot /></button>',
          },
          VDialog: {
            props: ["modelValue"],
            template: '<div v-if="modelValue" class="v-dialog-stub"><slot /></div>',
          },
          VCard: { template: "<div><slot /></div>" },
          VCardTitle: { template: "<h2><slot /></h2>" },
          VCardText: { template: "<p><slot /></p>" },
          VCardActions: { template: '<div class="mcp-revoke-actions"><slot /></div>' },
        },
      },
    });
    await flushPromises();
    await wrapper.get('[role="tab"][aria-controls="settings-panel-mcp"]').trigger("click");
    expect(wrapper.text()).toContain("MCP access");
    expect(wrapper.text()).not.toContain("KEEP A COPY");
    expect(wrapper.find('[aria-labelledby="settings-tab-export"]').exists()).toBe(false);
    expect(wrapper.findAll('.mcp-categories input:checked')).toHaveLength(9);
    await wrapper.get('input[name="mcpTokenName"]').setValue("Codex");
    expect((wrapper.get('select[name="mcpExpiry"]').element as HTMLSelectElement).value).toBe("fifteen_minutes");
    expect(wrapper.get('select[name="mcpExpiry"]').text()).toContain("15 minutes");
    await wrapper.get('select[name="mcpExpiry"]').setValue("three_hours");
    await wrapper.get('.mcp-categories input[value="logs"]').setValue(false);
    await wrapper.get('#settings-panel-mcp form').trigger("submit");
    await flushPromises();

    const createCall = vi.mocked(api).mock.calls.find((call) => call[0] === "/mcp-tokens" && call[1]?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall![1]!.body as string)).toMatchObject({ name: "Codex", categories: expect.arrayContaining(["notes"]), expiry: "three_hours" });
    expect(JSON.parse(createCall![1]!.body as string).categories).not.toContain("logs");
    expect(wrapper.text()).toContain("kb_mcp_one_time_secret");
    expect(wrapper.text()).toContain("Ready to copy");
    await wrapper.get(".mcp-setup-text button").trigger("click");
    expect(writeText).toHaveBeenCalledWith("Send a request to https://knowledgebase.blaqc.space/mcp with API token: kb_mcp_one_time_secret and tell me when you are authenticated successfully");
    expect(wrapper.text()).toContain("Expires");
    expect(wrapper.get(".mcp-token button").attributes()).toMatchObject({ "data-color": "error", "data-variant": "outlined" });
    await wrapper.get(".mcp-secret-value button").trigger("click");
    expect(writeText).toHaveBeenCalledWith("kb_mcp_one_time_secret");
    expect(wrapper.text()).toContain("Token copied to clipboard.");
    expect(wrapper.get(".mcp-secret-value button").text()).toBe("Copied");
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    await wrapper.get(".mcp-secret-value button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Could not copy the token. Select it and copy it manually.");
    expect(wrapper.get(".mcp-secret-value button").text()).toBe("Copy token");

    await wrapper.get(".mcp-token button").trigger("click");
    expect(wrapper.get('[role="alertdialog"]').attributes()).toMatchObject({ "aria-modal": "true", "aria-labelledby": "mcp-revoke-title", "aria-describedby": "mcp-revoke-description" });
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Connected clients using Codex will lose access immediately.");
    await wrapper.get(".mcp-revoke-actions button:first-child").trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(vi.mocked(api)).not.toHaveBeenCalledWith("/mcp-tokens/token-1", expect.objectContaining({ method: "DELETE" }));

    await wrapper.get(".mcp-token button").trigger("click");
    await wrapper.get(".mcp-revoke-confirm").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/mcp-tokens/token-1", expect.objectContaining({ method: "DELETE" }));
    expect(wrapper.find(".mcp-token").exists()).toBe(false);
  });

  it("requires the current password for accounts that also use Google sign-in", async () => {
    vi.mocked(api).mockResolvedValue({
      email: "person@example.com",
      hasPassword: true,
      hasGoogle: true,
    });
    const wrapper = mount(SettingsView);
    await flushPromises();

    expect(
      wrapper.get('input[name="currentPassword"]').attributes("autocomplete"),
    ).toBe("current-password");
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("new-password");
    vi.mocked(api).mockResolvedValue({
      email: "person@example.com",
      hasPassword: true,
      hasGoogle: true,
    });
    await wrapper.get("form").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/auth/password",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "new-password",
        }),
      }),
    );
  });

  it("marks the change form for browser password managers", async () => {
    vi.mocked(api).mockResolvedValue({
      email: "person@example.com",
      hasPassword: true,
      hasGoogle: false,
    });
    const wrapper = mount(SettingsView);
    await flushPromises();

    const form = wrapper.get("#password-change-form");
    expect(form.attributes()).toMatchObject({
      action: "/settings",
      autocomplete: "on",
      method: "post",
    });
    expect(form.get('input[name="username"]').attributes()).toMatchObject({
      autocomplete: "username",
      type: "hidden",
    });
    expect(
      (form.get('input[name="username"]').element as HTMLInputElement).value,
    ).toBe("person@example.com");
    expect(form.get("#current-password").attributes("autocomplete")).toBe(
      "current-password",
    );
    expect(form.get("#new-password").attributes("autocomplete")).toBe(
      "new-password",
    );
    expect(form.get("#confirm-password").attributes("autocomplete")).toBe(
      "new-password",
    );
  });

  it("offers the changed password to browser credential storage after success", async () => {
    const store = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "credentials", {
      configurable: true,
      value: { store },
    });
    class PasswordCredentialMock {
      id: string;
      password: string;

      constructor(value: { id: string; password: string }) {
        this.id = value.id;
        this.password = value.password;
      }
    }
    vi.stubGlobal("PasswordCredential", PasswordCredentialMock);
    vi.mocked(api).mockResolvedValue({
      email: "person@example.com",
      hasPassword: true,
      hasGoogle: false,
    });
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("new-password");

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "person@example.com",
        password: "new-password",
      }),
    );
    expect(store.mock.calls[0][0]).toBeInstanceOf(PasswordCredentialMock);
    expect(wrapper.get('[role="status"]').text()).toContain("Password saved.");
    wrapper.unmount();
  });

  it("preserves credential inputs and offers recovery when saving fails", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/auth/me")
        return { email: "person@example.com", hasPassword: true, hasGoogle: false };
      throw new Error("incorrect current password");
    });
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('input[name="currentPassword"]').setValue("wrong-current");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper.get('input[name="confirmPassword"]').setValue("new-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Check your current password and try again.");
    expect((wrapper.get('input[name="currentPassword"]').element as HTMLInputElement).value).toBe("wrong-current");
    expect((wrapper.get('input[name="newPassword"]').element as HTMLInputElement).value).toBe("new-password");
    expect((wrapper.get('input[name="confirmPassword"]').element as HTMLInputElement).value).toBe("new-password");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/auth/password",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("rejects mismatched new passwords before calling the API", async () => {
    vi.mocked(api).mockResolvedValue({
      email: "person@example.com",
      hasPassword: true,
      hasGoogle: false,
    });
    const wrapper = mount(SettingsView);
    await flushPromises();
    await wrapper.get('input[name="currentPassword"]').setValue("old-password");
    await wrapper.get('input[name="newPassword"]').setValue("new-password");
    await wrapper
      .get('input[name="confirmPassword"]')
      .setValue("different-password");

    await wrapper.get("form").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Passwords do not match",
    );
  });
});
