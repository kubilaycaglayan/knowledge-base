import { describe, expect, it } from "vitest";
import { addCalendarDays, barPosition, inclusiveDayCount, timelineDays } from "./board-gantt";

describe("board gantt calendar math", () => {
  it("counts both endpoints for a single day and a range", () => {
    expect(inclusiveDayCount("2024-02-29", "2024-02-29")).toBe(1);
    expect(inclusiveDayCount("2024-02-28", "2024-03-01")).toBe(3);
  });

  it("adds calendar days across month, year, and leap-day boundaries", () => {
    expect(addCalendarDays("2023-12-31", 1)).toBe("2024-01-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addCalendarDays("2024-01-01", -1)).toBe("2023-12-31");
  });

  it("builds a bounded inclusive timeline without daylight-saving drift", () => {
    expect(timelineDays("2024-03-09", "2024-03-11")).toEqual([
      "2024-03-09", "2024-03-10", "2024-03-11",
    ]);
    expect(timelineDays("2024-01-01", "2025-01-01")).toHaveLength(366);
  });

  it("clips bars to the visible window and preserves inclusive width", () => {
    expect(barPosition("2024-02-28", "2024-03-02", ["2024-03-01", "2024-03-02"]))
      .toEqual({ left: 0, width: 100 });
    expect(barPosition("2024-03-02", "2024-03-02", ["2024-03-01", "2024-03-02"]))
      .toEqual({ left: 50, width: 50 });
    expect(barPosition(undefined, undefined, ["2024-03-01"])).toBeNull();
  });
});
