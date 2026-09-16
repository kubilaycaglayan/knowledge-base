import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FloatingTimeTracker from "./FloatingTimeTracker.vue";
import vuetify from "../plugins/vuetify";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("session tracker acceptance", () => {
  let wrapper: VueWrapper;
  const labels = ["Focus", "Review", "Planning"].map((name, index) => ({
    id: `label-${index}`,
    name,
    scopes: ["TIME_ENTRY"],
  }));
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (path === "/paths")
        return [
          { id: "active", name: "Study", status: "ACTIVE" },
          { id: "archived", name: "Archived", status: "ARCHIVED" },
        ];
      if (path === "/labels?scope=TIME_ENTRY") return labels;
      if (path === "/labels" && options.method === "POST")
        return { id: "created", name: "New label", scopes: ["TIME_ENTRY"] };
      if (path === "/timers/current") return null;
      if (path === "/timers/draft")
        return options.method === "PUT" ? JSON.parse(String(options.body)) : {};
      return [];
    });
  });
  afterEach(() => wrapper?.unmount());
  async function render() {
    wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
  }
  const chips = () => wrapper.findAll("#tt-label-options button");
  const chip = (name: string) =>
    chips().find((button) => button.text().replace("×", "") === name)!;
  const selected = () =>
    chips()
      .filter((button) => button.attributes("aria-pressed") === "true")
      .map((button) => button.text().replace("×", ""));
  const summary = () => wrapper.get(".tracker-field-heading > span").text();
  const toggle = () => wrapper.get(".label-picker-toggle");

  it("P4–P8: offers add first and only active paths", async () => {
    await render();
    const select = wrapper.findComponent(
      ".tracker-path-select",
    ) as VueWrapper<any>;
    expect(select.props("items")).toEqual([
      { id: "__add_new_path__", name: "＋ Add a new path…", status: "" },
      { id: "active", name: "Study", status: "ACTIVE" },
    ]);
  });

  it("L3–L4, L6–L10, L14–L15, L19–L20: preserves the selected set and prioritizes it when closed", async () => {
    await render();
    expect(summary()).toBe("3 available");
    expect(
      chips().every((button) => button.attributes("aria-pressed") === "false"),
    ).toBe(true);
    await chip("Review").trigger("click");
    await chip("Planning").trigger("click");
    expect(selected()).toEqual(["Review", "Planning"]);
    expect(summary()).toBe("3 available · 2 selected");
    await toggle().trigger("click");
    expect(toggle().attributes("aria-expanded")).toBe("false");
    expect(chips().map((button) => button.text())).toEqual([
      "Review×",
      "Planning×",
      "Focus",
    ]);
    await chip("Review").trigger("click");
    expect(toggle().attributes("aria-expanded")).toBe("true");
    expect(selected()).toEqual(["Planning"]);
    expect(summary()).toBe("3 available · 1 selected");
    await chip("Planning").trigger("click");
    expect(selected()).toEqual([]);
    expect(summary()).toBe("3 available");
  });

  it("L11–L12, L18: keeps internal focus open and dismisses on Escape, outside pointer, or focus leaving", async () => {
    await render();
    await toggle().trigger("click");
    await chip("Focus").trigger("pointerdown");
    expect(toggle().attributes("aria-expanded")).toBe("true");
    await chip("Focus").trigger("keydown", { key: "Escape" });
    expect(toggle().attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle().element);
    await toggle().trigger("click");
    await wrapper
      .get(".label-picker")
      .trigger("focusout", { relatedTarget: chip("Review").element });
    expect(toggle().attributes("aria-expanded")).toBe("true");
    await wrapper
      .get(".label-picker")
      .trigger("focusout", { relatedTarget: wrapper.get("textarea").element });
    expect(toggle().attributes("aria-expanded")).toBe("false");
    await toggle().trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(toggle().attributes("aria-expanded")).toBe("false");
  });

  it.each([false, true])(
    "L16–L17: creates a label while open=%s and preserves other selections",
    async (open) => {
      await render();
      await chip("Focus").trigger("click");
      if (!open) await toggle().trigger("click");
      const input = wrapper.get('input[aria-label="New session label name"]');
      expect(input.isVisible()).toBe(true);
      expect(wrapper.get(".create-label").isVisible()).toBe(true);
      await input.setValue("  New label  ");
      await wrapper.get(".create-label").trigger("click");
      await flushPromises();
      expect(api).toHaveBeenCalledWith(
        "/labels",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New label",
            scopes: ["TIME_ENTRY"],
            color: null,
          }),
        }),
      );
      expect(selected()).toEqual(["Focus", "New label"]);
      expect(summary()).toBe("4 available · 2 selected");
      expect(input.element).toHaveProperty("value", "");
    },
  );

  it("C4: renders an empty label set with a usable creation flow", async () => {
    vi.mocked(api).mockResolvedValue([]);
    await render();
    expect(chips()).toHaveLength(0);
    expect(summary()).toBe("0 available");
    await wrapper
      .get('input[aria-label="New session label name"]')
      .setValue("First label");
    expect(wrapper.get(".create-label").attributes("disabled")).toBeUndefined();
  });
});
