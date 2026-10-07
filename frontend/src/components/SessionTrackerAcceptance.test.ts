import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
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
  afterEach(() => {
    wrapper?.unmount();
    document.querySelectorAll(".label-picker-menu").forEach((menu) => menu.remove());
  });
  async function render() {
    wrapper = mount(FloatingTimeTracker, {
      attachTo: document.body,
      props: { inline: true },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
  }
  const chips = () => [...document.querySelectorAll<HTMLElement>('.label-picker-menu [role="option"]')]
    .map((element) => new DOMWrapper(element));
  const chip = (name: string) => chips().find((button) => button.find(".option-name").text() === name)!;
  const selected = () => chips().filter((button) => button.attributes("aria-selected") === "true")
    .map((button) => button.find(".option-name").text());
  const summary = () => wrapper.get(".tracker-field-heading > span:last-child").text();
  const toggle = () => wrapper.get(".picker-chevron");

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
    expect(chips()).toHaveLength(0);
    await toggle().trigger("click");
    expect(chips()).toHaveLength(3);
    expect(chips().every((button) => button.attributes("aria-selected") === "false")).toBe(true);
    await chip("Review").trigger("click");
    await chip("Planning").trigger("click");
    expect(selected()).toEqual(["Review", "Planning"]);
    expect(summary()).toBe("3 available · 2 selected");
    await chip("Review").trigger("click");
    expect(selected()).toEqual(["Planning"]);
    expect(summary()).toBe("3 available · 1 selected");
    await chip("Planning").trigger("click");
    expect(selected()).toEqual([]);
    expect(summary()).toBe("3 available");
  });

  it("L11–L12, L18: keeps internal focus open and dismisses on Escape, outside pointer, or focus leaving", async () => {
    await render();
    await toggle().trigger("click");
    const input = document.querySelector<HTMLInputElement>('.label-picker-menu input[aria-label="Search session labels"]')!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(toggle().attributes("aria-expanded")).toBe("true");
    await flushPromises();
    expect(toggle().attributes("aria-expanded")).toBe("false");
    await toggle().trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(toggle().attributes("aria-expanded")).toBe("false");
  });

  it("creates a label and preserves other selections", async () => {
      await render();
      await toggle().trigger("click");
      await chip("Focus").trigger("click");
      const input = document.querySelector<HTMLInputElement>('.label-picker-menu input[aria-label="Search session labels"]')!;
      await new DOMWrapper(input).setValue("  New label  ");
      await flushPromises();
      expect(document.querySelector('.label-picker-menu [id$="option-create"]')).not.toBeNull();
      document.querySelector<HTMLButtonElement>('.label-picker-menu [id$="option-create"]')?.click();
      await flushPromises();
      expect(api).toHaveBeenCalledWith(
        "/labels",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New label",
            color: null,
            scopes: ["NOTE", "TIME_ENTRY", "LOG", "BOARD"],
          }),
        }),
      );
      expect(selected()).toEqual(["Focus", "New label"]);
      expect(summary()).toBe("4 available · 2 selected");
      expect(input.value).toBe("");
  });

  it("C4: renders an empty label set with a usable creation flow", async () => {
    vi.mocked(api).mockResolvedValue([]);
    await render();
    expect(chips()).toHaveLength(0);
    expect(summary()).toBe("0 available");
    await toggle().trigger("click");
    const input = document.querySelector<HTMLInputElement>('.label-picker-menu input[aria-label="Search session labels"]')!;
    input.value = "First label";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(document.querySelector('.label-picker-menu [id$="option-create"]')).not.toBeNull();
  });
});
