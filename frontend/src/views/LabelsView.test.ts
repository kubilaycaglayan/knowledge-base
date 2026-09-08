import { flushPromises, mount } from "@vue/test-utils";
import LabelsView from "./LabelsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("LabelsView", () => {
  it("loads labels, creates a multi-scope label, and saves edits", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels" && !options) return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path === "/labels" && options?.method === "POST") return { id: "two", name: "Focus", color: "#E05D44", scopes: ["CALENDAR", "TIME_ENTRY"] };
      if (path === "/labels/one" && options?.method === "PUT") return { id: "one", name: "Study time", color: "#2F855A", scopes: ["NOTE", "TIME_ENTRY"] };
      return undefined;
    });
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("Study");
    await wrapper.get('input[name="label-name"]').setValue("Focus");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Focus");
    await wrapper.findAll(".label-row")[1].get("button.ghost").trigger("click");
    await wrapper.get('input[aria-label="Edit Study name"]').setValue("Study time");
    await wrapper.get("button.compact").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Study time");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/labels/one" && options?.method === "PUT")).toBe(true);
  });
});
