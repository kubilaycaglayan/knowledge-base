import { flushPromises, mount } from "@vue/test-utils";
import LabelsView from "./LabelsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("LabelsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  it("shows the fifteen-color palette for new and edited labels", async () => {
    vi.mocked(api).mockResolvedValue([{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }]);
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();

    await wrapper.get('button[aria-label="Add label"]').trigger("click");
    expect(wrapper.findAll(".label-create-dialog .color-palette button")).toHaveLength(15);
    await wrapper.get(".label-row button.ghost").trigger("click");
    expect(wrapper.findAll(".label-edit-colors button")).toHaveLength(15);
  });

  it("reuses cached labels when the view is mounted again", async () => {
    vi.mocked(api).mockResolvedValue([{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }]);
    const first = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    first.unmount();

    mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();

    expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/labels")).toHaveLength(1);
  });

  it("offers a second confirmation and removes assignments only after confirming", async () => {
    const confirmations: string[] = [];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels" && !options) return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path.startsWith("/labels/one") && options?.method === "DELETE") {
        if (path.includes("removeAssignments")) return undefined;
        throw new Error("assigned");
      }
      return undefined;
    });
    const wrapper = mount(LabelsView, {
      global: {
        stubs: {
          PromptDialog: {
            template: "<div />",
            methods: { open(message: string) { confirmations.push(message); return Promise.resolve("confirmed"); } },
          },
        },
      },
    });
    await flushPromises();
    await wrapper.get("button.danger").trigger("click");
    await flushPromises();

    expect(confirmations).toEqual([
      "Remove “Study”?",
      "“Study” has assignments. Remove the label and its assignments?",
    ]);
    expect(vi.mocked(api).mock.calls.some(([path]) => path === "/labels/one?removeAssignments=true")).toBe(true);
    expect(wrapper.text()).not.toContain("Study");
  });

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
    await wrapper.get('button[aria-label="Add label"]').trigger("click");
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

  it("shows Logs as an editable label scope", async () => {
    vi.mocked(api).mockResolvedValue([{ id: "log-label", name: "Important", color: null, scopes: ["LOG"], system: false }]);
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    expect(wrapper.get(".scope-list").text()).toBe("Logs");
    expect(wrapper.text()).not.toContain("System label");
    expect(wrapper.get(".label-row button.danger").attributes("disabled")).toBeUndefined();
  });
});
