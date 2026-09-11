import { describe, expect, it } from "vitest";
import { formatTrackedDuration } from "./format";

describe("formatTrackedDuration", () => {
  it.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [59, "59 seconds"],
    [60, "1 minute"],
    [61, "1 minute"],
    [3599, "59 minutes"],
    [3600, "1h"],
    [3601, "1h"],
    [3660, "1h 1 minute"],
    [4980, "1h 23 minutes"],
    [7200, "2h"],
    [24 * 60 * 60, "24h"],
    [24 * 60 * 60 + 60, "24h 1 minute"],
    [25 * 60 * 60 + 23 * 60, "25h 23 minutes"],
    [99 * 60 * 60 + 59 * 60, "99h 59 minutes"],
    [100 * 60 * 60 + 59 * 60, "100h"],
    [-1, "0 seconds"],
    [59.9, "59 seconds"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatTrackedDuration(seconds)).toBe(expected);
  });
});
