import { decimalHours, formatDuration, formatDurationHoursMinutes, percentageOf } from "./duration";

describe("duration utilities", () => {
  it.each([
    [0, "00:00:00"],
    [1.9, "00:00:01"],
    [61, "00:01:01"],
    [3661, "01:01:01"],
    [100 * 60 * 60 + 59 * 60, "100h"],
    [-10, "00:00:00"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("converts seconds to decimal hours without returning negative values", () => {
    expect(decimalHours(5400)).toBe(1.5);
    expect(decimalHours(-1)).toBe(0);
  });

  it.each([[0, "00:00"], [61, "00:01"], [3661, "01:01"], [86399, "23:59"], [100 * 60 * 60 + 59 * 60, "100h"]])(
    "formats %s seconds as report minutes %s",
    (seconds, expected) => expect(formatDurationHoursMinutes(seconds)).toBe(expected),
  );

  it("calculates percentages and avoids division by zero", () => {
    expect(percentageOf(15, 60)).toBe(25);
    expect(percentageOf(15, 0)).toBe(0);
  });
});
