import { describe, expect, it } from "vitest";
import { snackbarBottom } from "./snackbar-position";

describe("snackbarBottom", () => {
  it("sits just above the floating tracker when it is on screen", () => {
    expect(snackbarBottom(800, 730)).toBe(78);
  });

  it("uses the bottom gutter when there is no tracker, or it is off screen", () => {
    expect(snackbarBottom(800, null)).toBe(16);
    expect(snackbarBottom(800, 900)).toBe(16);
  });
});
