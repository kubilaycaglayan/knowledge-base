import { flushPromises, mount } from "@vue/test-utils";
import LabelsView from "./LabelsView.vue";
import { api, ApiError } from "../lib/api";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  ApiError: class MockApiError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  },
}));

describe("LabelsView", () => {
  it("shows the intentional empty state when no labels exist", async () => {
    setActivePinia(createPinia());
    vi.mocked(api).mockResolvedValue([]);
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    try {
      await flushPromises();
      expect(wrapper.text()).toContain("No labels yet. Add one above to get started.");
      expect(wrapper.findAll(".label-row")).toHaveLength(0);
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    } finally {
      wrapper.unmount();
    }
  });

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

  it("saves a label color immediately from its swatch without opening the edit dialog", async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels" && !options)
        return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path === "/labels/one" && options?.method === "PUT")
        return { id: "one", name: "Study", color: "#F97316", scopes: ["NOTE"] };
      return undefined;
    });
    const wrapper = mount(LabelsView, { attachTo: document.body, global: { stubs: { PromptDialog: true } } });
    try {
      await flushPromises();
      const swatch = wrapper.get('button[aria-label="Change color for Study"]');
      await swatch.trigger("click");
      expect(swatch.attributes("aria-expanded")).toBe("true");
      expect(wrapper.findAll(".label-color-popover .color-palette button")).toHaveLength(15);
      expect(wrapper.find(".label-edit-dialog").exists()).toBe(false);
      expect(wrapper.find('input[name="label-name"]').exists()).toBe(false);
      expect(wrapper.find(".scope-selector").exists()).toBe(false);

      await wrapper.get('button[aria-label="Set Study color: Orange (#F97316)"]').trigger("click");
      await flushPromises();

      expect(vi.mocked(api)).toHaveBeenCalledWith("/labels/one", {
        method: "PUT",
        body: JSON.stringify({ name: "Study", color: "#F97316", scopes: ["NOTE"] }),
      });
      expect(wrapper.find(".label-color-popover").exists()).toBe(false);
      expect(wrapper.get('button[aria-label="Change color for Study"]').attributes("style")).toContain("rgb(249, 115, 22)");
      expect(document.activeElement).toBe(wrapper.get('button[aria-label="Change color for Study"]').element);
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the color palette open and reports an immediate-save failure", async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels" && !options)
        return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path === "/labels/one" && options?.method === "PUT") throw new Error("temporary failure");
      return undefined;
    });
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    await wrapper.get('button[aria-label="Change color for Study"]').trigger("click");
    await wrapper.get('button[aria-label="Set Study color: Orange (#F97316)"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".label-color-popover [role=alert]").text()).toBe("Could not save this label color. Try again.");
    expect(wrapper.find(".label-edit-dialog").exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Change color for Study"]').attributes("style")).toContain("rgb(40, 120, 213)");
  });

  it("closes the color picker with Escape and returns focus to its swatch", async () => {
    vi.mocked(api).mockResolvedValue([{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }]);
    const wrapper = mount(LabelsView, { attachTo: document.body, global: { stubs: { PromptDialog: true } } });
    try {
      await flushPromises();
      const swatch = wrapper.get('button[aria-label="Change color for Study"]');
      await swatch.trigger("click");
      await wrapper.get(".label-color-popover").trigger("keydown.esc");
      await flushPromises();
      expect(wrapper.find(".label-color-popover").exists()).toBe(false);
      expect(document.activeElement).toBe(swatch.element);
    } finally {
      wrapper.unmount();
    }
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

  it("preserves an assigned label and explains that assignments must be removed first", async () => {
    const confirmations: string[] = [];
    vi.mocked(api).mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/labels" && !options)
          return [
            { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
          ];
        if (path === "/labels/one" && options?.method === "DELETE")
          throw new ApiError("Labels in use cannot be deleted; remove their assignments first", 409);
        return undefined;
      },
    );
    const wrapper = mount(LabelsView, {
      global: {
        stubs: {
          PromptDialog: {
            template: "<div />",
            methods: {
              open(message: string, description: string) {
                confirmations.push(`${message} ${description}`);
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
      "Remove “Study”? Labels in use must be unassigned first.",
    ]);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path]) => path === "/labels/one?removeAssignments=true",
        ),
    ).toBe(false);
    expect(wrapper.text()).toContain("Remove assignments before removing this label.");
    expect(wrapper.text()).toContain("Study");
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

  it("rejects blank and duplicate label names without losing the draft", async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels" && !options)
        return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path === "/labels" && options?.method === "POST")
        throw new Error("duplicate");
      return undefined;
    });
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    await wrapper.get('button[aria-label="Add label"]').trigger("click");
    const form = wrapper.get(".label-create-form");
    const name = wrapper.get('input[name="label-name"]');

    await name.setValue("   ");
    await form.trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toBe("Enter a name.");
    expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);

    await name.setValue("Study");
    await form.trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Could not create this label. Names must be unique.",
    );
    expect((name.element as HTMLInputElement).value).toBe("Study");
  });

  it("keeps a label after removal is cancelled or fails", async () => {
    const cancelledOpen = vi.fn().mockResolvedValue(null);
    vi.mocked(api).mockResolvedValue([
      { id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] },
    ]);
    const cancelled = mount(LabelsView, {
      global: {
        stubs: {
          PromptDialog: { template: "<div />", methods: { open: cancelledOpen } },
        },
      },
    });
    await flushPromises();
    await cancelled.get('button[aria-label="Remove Study"]').trigger("click");
    await flushPromises();
    expect(cancelled.text()).toContain("Study");
    expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);

    const confirmOpen = vi.fn().mockResolvedValue("confirmed");
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels" && !options)
        return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path.startsWith("/labels/one") && options?.method === "DELETE")
        throw new Error("assigned or unavailable");
      return undefined;
    });
    const failed = mount(LabelsView, {
      global: {
        stubs: {
          PromptDialog: { template: "<div />", methods: { open: confirmOpen } },
        },
      },
    });
    await flushPromises();
    await failed.get('button[aria-label="Remove Study"]').trigger("click");
    await flushPromises();
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    expect(failed.text()).toContain("Study");
    expect(failed.get('[role="alert"]').text()).toBe("Could not remove this label.");
  });

  it("preserves a label edit draft when saving fails", async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels" && !options)
        return [{ id: "one", name: "Study", color: "#2878D5", scopes: ["NOTE"] }];
      if (path === "/labels/one" && options?.method === "PUT")
        throw new Error("temporary failure");
      return undefined;
    });
    const wrapper = mount(LabelsView, { global: { stubs: { PromptDialog: true } } });
    await flushPromises();
    await wrapper.get('button[aria-label="Edit Study"]').trigger("click");
    const name = wrapper.get('.label-edit-dialog input[name="label-name"]');
    await name.setValue("Study notes");
    await wrapper.get(".label-edit-dialog form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not save this label.");
    expect((name.element as HTMLInputElement).value).toBe("Study notes");
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
