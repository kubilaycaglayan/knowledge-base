import { flushPromises, mount } from "@vue/test-utils";
import LabelsView from "./LabelsView.vue";
import { api } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("LabelsView", () => {
  it("restores and updates the label query in the URL", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: "one", name: "Study", color: null, scopes: ["NOTE"] },
      { id: "two", name: "Work", color: null, scopes: ["NOTE"] },
    ]);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/labels", component: LabelsView }] });
    await router.push("/labels?q=Study");
    const wrapper = mount(LabelsView, { global: { plugins: [router], stubs: { PromptDialog: true } } });
    try {
      await flushPromises();
      expect(wrapper.findAll(".label-row")).toHaveLength(1);
      const search = wrapper.get('input[aria-label="Search labels"]');
      expect(search.element).toHaveProperty("value", "Study");
      await search.setValue("Work");
      await flushPromises();
      expect(router.currentRoute.value.query.q).toBe("Work");
      await router.push("/labels?q=Study");
      await flushPromises();
      expect(search.element).toHaveProperty("value", "Study");
      await search.trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(router.currentRoute.value.query.q).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
  it("focuses label search with / and filters names, leaving Cmd/Ctrl+K to global search", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: "one", name: "Study", color: null, scopes: ["NOTE"] },
      { id: "two", name: "Work", color: null, scopes: ["NOTE"] },
    ]);
    const wrapper = mount(LabelsView, { attachTo: document.body, global: { stubs: { PromptDialog: true } } });
    try {
      await flushPromises();
      for (const modifier of ["metaKey", "ctrlKey"]) {
        const global = new KeyboardEvent("keydown", { key: "k", [modifier]: true, bubbles: true, cancelable: true });
        document.dispatchEvent(global);
        expect(global.defaultPrevented).toBe(false);
      }
      const shortcut = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      document.dispatchEvent(shortcut);
      await flushPromises();
      const input = wrapper.get('input[aria-label="Search labels"]');
      expect(document.activeElement).toBe(input.element);
      expect(shortcut.defaultPrevented).toBe(true);
      // Inside the field, "/" is just a character.
      const typed = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      input.element.dispatchEvent(typed);
      expect(typed.defaultPrevented).toBe(false);
      await input.setValue("  STU  ");
      expect(wrapper.findAll(".label-row").map(row => row.get("strong").text())).toEqual(["Study"]);
      await input.setValue("missing");
      expect(wrapper.text()).toContain("No labels match your search.");
      await input.trigger("keydown", { key: "Escape" });
      expect(wrapper.findAll(".label-row")).toHaveLength(2);
      await wrapper.get('button[aria-label="Add label"]').trigger("click");
      const dialogShortcut = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      document.dispatchEvent(dialogShortcut);
      expect(dialogShortcut.defaultPrevented).toBe(false);
    } finally {
      wrapper.unmount();
    }
    const afterUnmount = new KeyboardEvent("keydown", { key: "/", cancelable: true });
    document.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  it("shows the fifteen-color palette for new and edited labels", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
    ]);
    const wrapper = mount(LabelsView, {
      global: { stubs: { PromptDialog: true } },
    });
    await flushPromises();

    await wrapper.get('button[aria-label="Add label"]').trigger("click");
    expect(
      wrapper.findAll(".label-create-dialog .color-palette button"),
    ).toHaveLength(15);
    expect(wrapper.get('button[aria-label="Edit Study"]').find("svg").exists()).toBe(true);
    expect(wrapper.get('button[aria-label="Remove Study"]').find("svg").exists()).toBe(true);
    await wrapper.get(".label-create-dialog button.text-button").trigger("click");
    await wrapper.get('button[aria-label="Edit Study"]').trigger("click");
    expect(wrapper.findAll(".label-edit-dialog .color-palette button")).toHaveLength(15);
  });

  it("reuses cached labels when the view is mounted again", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
    ]);
    const first = mount(LabelsView, {
      global: { stubs: { PromptDialog: true } },
    });
    await flushPromises();
    first.unmount();

    mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();

    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === "/labels"),
    ).toHaveLength(1);
  });

  it("offers a second confirmation and removes assignments only after confirming", async () => {
    const confirmations: string[] = [];
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/labels" && !options)
          return [
            { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
          ];
        if (path.startsWith("/labels/one") && options?.method === "DELETE") {
          if (path.includes("removeAssignments")) return undefined;
          throw new Error("assigned");
        }
        return undefined;
      },
    );
    const wrapper = mount(LabelsView, {
      global: {
        stubs: {
          PromptDialog: {
            template: "<div />",
            methods: {
              open(message: string) {
                confirmations.push(message);
                return Promise.resolve("confirmed");
              },
            },
          },
        },
      },
    });
    await flushPromises();
    await wrapper.get('button[aria-label="Remove Study"]').trigger("click");
    await flushPromises();

    expect(confirmations).toEqual([
      "Remove “Study”?",
      "“Study” has assignments. Remove the label and its assignments?",
    ]);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path]) => path === "/labels/one?removeAssignments=true",
        ),
    ).toBe(true);
    expect(wrapper.text()).not.toContain("Study");
  });

  it("creates labels hidden from Calendar only, shown on Boards, by default and saves inverted scope selections", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/labels" && !options)
          return [
            { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
          ];
        if (path === "/labels" && options?.method === "POST")
          return {
            id: "two",
            name: "Focus",
            color: "#E05D44",
            scopes: ["CALENDAR", "TIME_ENTRY"],
          };
        if (path === "/labels/one" && options?.method === "PUT")
          return {
            id: "one",
            name: "Study time",
            color: "#2F855A",
            scopes: ["NOTE", "TIME_ENTRY"],
          };
        return undefined;
      },
    );
    const wrapper = mount(LabelsView, {
      global: { stubs: { PromptDialog: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Study");
    await wrapper.get('button[aria-label="Add label"]').trigger("click");
    expect(wrapper.get(".scope-selector legend").text()).toBe("Don’t show in");
    expect(
      wrapper.get(".scope-selector label:nth-of-type(2) input").element,
    ).toHaveProperty("checked", true);
    expect(
      wrapper.get(".scope-selector label:nth-of-type(1) input").element,
    ).toHaveProperty("checked", false);
    expect(
      wrapper.get(".scope-selector label:nth-of-type(5) input").element,
      "Boards is not ticked under “Don’t show in”",
    ).toHaveProperty("checked", false);
    await wrapper.get('input[name="label-name"]').setValue("Focus");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Focus");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/labels",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Focus",
          color: "#F8FAFC",
          scopes: ["NOTE", "TIME_ENTRY", "LOG", "BOARD"],
        }),
      }),
    );
    await wrapper.findAll(".label-row")[1]
      .get('button[aria-label="Edit Study"]')
      .trigger("click");
    await wrapper
      .get('.label-edit-dialog input[name="label-name"]')
      .setValue("Study time");
    expect(wrapper.get(".label-edit-dialog .scope-selector legend").text()).toBe("Don’t show in");
    expect(
      wrapper.get(".label-edit-dialog .scope-selector label:nth-of-type(2) input").element,
    ).toHaveProperty("checked", true);
    await wrapper
      .get(".label-edit-dialog .scope-selector label:nth-of-type(1) input")
      .setValue(true);
    await wrapper.get(".label-edit-dialog form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Study time");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/labels/one",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Study time",
          color: "#2878D5",
          scopes: [],
        }),
      }),
    );
  });

  it("shows Logs as an editable label scope", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        id: "log-label",
        name: "Important",
        color: null,
        scopes: ["LOG", "BOARD"],
        system: false,
      },
    ]);
    const wrapper = mount(LabelsView, {
      global: { stubs: { PromptDialog: true } },
    });
    await flushPromises();
    expect(wrapper.get(".scope-list").text()).toBe("Logs · Boards");
    await wrapper.get('button[aria-label="Add label"]').trigger("click");
    expect(wrapper.get(".scope-selector").text()).toContain("Boards");
    expect(wrapper.text()).not.toContain("System label");
    expect(
      wrapper.get(".label-row button.danger").attributes("disabled"),
    ).toBeUndefined();
  });
  // LH-06
  it("opens a label's history from its icon button", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/labels"
        ? [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }]
        : path.startsWith("/labels/one/history/records")
          ? { items: [], hasMore: false }
          : {
            labelId: "one",
            name: "Study",
            color: "#2878D5",
            firstUsedAt: null,
            lastUsedAt: null,
            totalUses: 0,
            trackedSeconds: 0,
            uses: { sessions: 0, logs: 0, notes: 0, calendarDays: 0, cards: 0 },
            timeline: [],
            hours: [],
            related: [],
          },
    );
    const wrapper = mount(LabelsView, {
      global: { stubs: { PromptDialog: true } },
      attachTo: document.body,
    });
    await flushPromises();

    const button = wrapper.get('button[aria-label="Show history of Study"]');
    expect(button.text()).toBe("");
    expect(button.find("svg").exists()).toBe(true);
    await button.trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toContainEqual(
      expect.stringMatching(/^\/labels\/one\/history\?zone=/),
    );
    expect(wrapper.find('[role="dialog"].label-history-dialog').exists()).toBe(
      true,
    );
    wrapper.unmount();
  });
});
