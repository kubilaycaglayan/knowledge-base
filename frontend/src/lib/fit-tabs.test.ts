import { describe, expect, it } from "vitest";
import { fitTabs } from "./fit-tabs";

describe("fitTabs", () => {
  it("keeps every tab when they all fit, without room for More", () => {
    expect(fitTabs([50, 60, 70], 196, 40, 8)).toBe(3);
  });

  it("reserves room for the More button once tabs overflow", () => {
    // 50 + 8 + 60 = 118 fits beside More (40 + 8); adding 70 would not.
    expect(fitTabs([50, 60, 70], 195, 40, 8)).toBe(2);
    expect(fitTabs([50, 60, 70], 170, 40, 8)).toBe(2);
    expect(fitTabs([50, 60, 70], 165, 40, 8)).toBe(1);
  });

  it("handles no room and no tabs", () => {
    expect(fitTabs([50, 60], 30, 40, 8)).toBe(0);
    expect(fitTabs([], 300, 40, 8)).toBe(0);
  });
});
