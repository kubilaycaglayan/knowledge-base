import { colorPalette, paletteColors } from "./color-palette";

// TH-19 (docs/test-hardening-plan.md)
describe("color palette", () => {
  it("has unique, named, six-digit hex colours", () => {
    expect(paletteColors).toHaveLength(colorPalette.length);
    for (const color of colorPalette) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.name.trim()).not.toBe("");
    }
    expect(new Set(paletteColors.map((hex) => hex.toUpperCase())).size).toBe(paletteColors.length);
    expect(new Set(colorPalette.map((color) => color.name)).size).toBe(colorPalette.length);
  });
});
