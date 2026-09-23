import { describe, expect, it } from "vitest";
import { formatCardDates } from "./card-dates";

const now = new Date(2026, 8, 23);

describe("formatCardDates", () => {
  it("shows a single day once", () => {
    expect(formatCardDates("2026-09-09", "2026-09-09", now)).toBe("9 Sep");
  });

  it("shows a range with both ends", () => {
    expect(formatCardDates("2026-09-09", "2026-09-10", now)).toBe("9 Sep – 10 Sep");
  });

  it("leaves out the year only for dates in the current year", () => {
    expect(formatCardDates("2025-12-30", "2026-01-02", now)).toBe("30 Dec 2025 – 2 Jan");
    expect(formatCardDates("2027-03-01", "2027-03-01", now)).toBe("1 Mar 2027");
  });

  it("labels open-ended dates and handles none", () => {
    expect(formatCardDates("2026-09-09", "", now)).toBe("From 9 Sep");
    expect(formatCardDates(undefined, "2026-09-10", now)).toBe("Until 10 Sep");
    expect(formatCardDates(undefined, undefined, now)).toBe("");
  });
});
