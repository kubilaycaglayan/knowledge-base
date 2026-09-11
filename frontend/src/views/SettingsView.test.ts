import { flushPromises, mount } from "@vue/test-utils";
import SettingsView from "./SettingsView.vue";
import { api, download } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn(), download: vi.fn() }));

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({ email: "person@example.com", hasPassword: false, hasGoogle: true });
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
});
