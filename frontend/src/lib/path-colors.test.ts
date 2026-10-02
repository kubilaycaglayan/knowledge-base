import { describe, expect, it } from "vitest";
import { colorPalette } from "./color-palette";
import { contrastingPathTextColor, pathTextContrastRatio } from "./path-colors";

describe("contrastingPathTextColor", () => {
  it("uses a light foreground on dark backgrounds and a dark foreground on light backgrounds", () => {
    expect(contrastingPathTextColor("#123456")).toBe("#FFFFFF");
    expect(contrastingPathTextColor("#EAB308")).toBe("#000000");
    expect(contrastingPathTextColor("#777777")).toBe("#000000");
  });

  it("keeps a configured foreground color", () => {
    expect(contrastingPathTextColor("#123456", "#22C55E")).toBe("#22C55E");
  });

  it("measures foreground and background contrast", () => {
    expect(pathTextContrastRatio("#123456", "#F8FAFC")).toBeGreaterThan(4.5);
    expect(pathTextContrastRatio("#3B82F6", "#102030")).toBeLessThan(4.5);
  });

  it("meets normal text contrast for every path palette color", () => {
    for (const { hex } of colorPalette) {
      const foreground = contrastingPathTextColor(hex);
      expect(pathTextContrastRatio(hex, foreground), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
});
