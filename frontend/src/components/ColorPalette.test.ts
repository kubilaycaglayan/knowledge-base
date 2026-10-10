import { mount } from "@vue/test-utils";
import ColorPalette from "./ColorPalette.vue";

describe("ColorPalette", () => {
  it("renders the complete compact palette and emits the selected hex", async () => {
    const wrapper = mount(ColorPalette, {
      props: { modelValue: "#F8FAFC", legend: "Path color" },
    });

    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(15);
    expect(buttons[0].attributes("aria-pressed")).toBe("true");
    expect(
      buttons.slice(0, 5).map((button) => button.attributes("aria-label")),
    ).toEqual([
      expect.stringContaining("Off White"),
      expect.stringContaining("Mid Gray"),
      expect.stringContaining("Near Black"),
      expect.stringContaining("Yellow"),
      expect.stringContaining("Amber"),
    ]);

    await buttons[10].trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["#3B82F6"]);
  });

  it("announces the currently selected color through pressed state", async () => {
    const wrapper = mount(ColorPalette, {
      props: { modelValue: "#F8FAFC", legend: "Calendar label color" },
    });
    const offWhite = wrapper.get('[aria-label="Choose color: Off White (#F8FAFC)"]');
    const orange = wrapper.get('[aria-label="Choose color: Orange (#F97316)"]');
    expect(offWhite.attributes("aria-pressed")).toBe("true");
    expect(orange.attributes("aria-pressed")).toBe("false");

    await wrapper.setProps({ modelValue: "#F97316" });

    expect(offWhite.attributes("aria-pressed")).toBe("false");
    expect(orange.attributes("aria-pressed")).toBe("true");
  });
});
