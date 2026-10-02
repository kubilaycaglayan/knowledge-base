import { describe, expect, it } from "vitest";
import { addCalendarDays, addCalendarMonths, barPosition, inclusiveDayCount, offscreenSide, timelineDays } from "./board-gantt";

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

  it("adds calendar months, clamping to the shorter month's last day", () => {
    expect(addCalendarMonths("2026-10-02", -2)).toBe("2026-08-02");
    expect(addCalendarMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addCalendarMonths("2024-12-31", 2)).toBe("2025-02-28");
    expect(addCalendarMonths("2024-04-30", -2)).toBe("2024-02-29");
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

  // GO-01, GO-02, GO-03
  it("tells which side of the visible days a card's dates lie on", () => {
    expect(offscreenSide("2026-09-05", "2026-09-05", "2026-09-06", "2026-09-16")).toBe("before");
    expect(offscreenSide("2026-09-01", "2026-09-05", "2026-09-06", "2026-09-16")).toBe("before");
    expect(offscreenSide("2026-09-17", "2026-09-20", "2026-09-06", "2026-09-16")).toBe("after");
    expect(offscreenSide("2026-09-05", "2026-09-06", "2026-09-06", "2026-09-16")).toBeNull();
    expect(offscreenSide("2026-09-16", "2026-09-30", "2026-09-06", "2026-09-16")).toBeNull();
    expect(offscreenSide("2026-09-01", "2026-09-30", "2026-09-06", "2026-09-16")).toBeNull();
    expect(offscreenSide(undefined, "2026-09-05", "2026-09-06", "2026-09-16")).toBe("before");
    expect(offscreenSide("2026-09-20", undefined, "2026-09-06", "2026-09-16")).toBe("after");
    expect(offscreenSide(undefined, undefined, "2026-09-06", "2026-09-16")).toBeNull();
  });
});
