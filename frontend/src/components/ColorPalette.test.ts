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
});
