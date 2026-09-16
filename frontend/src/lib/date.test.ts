import { formatDate, formatDateTime } from "./date";

describe("date formatting", () => {
  it("formats ISO strings and Date values using the en-GB calendar format", () => {
    expect(formatDate("2026-08-27T12:34:56Z")).toBe("27/08/2026");
    expect(formatDate(new Date("2026-01-05T00:00:00Z"))).toBe("05/01/2026");
  });

  it("includes time components in date-time formatting", () => {
    expect(formatDateTime("2026-08-27T12:34:56Z")).toMatch(
      /27\/08\/2026, 12:34:56/,
    );
  });
});
