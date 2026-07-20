import { describe, expect, it } from "vitest";
import { addDays, formatDateInTimeZone, formatLocalDate, localDayUtcRange, parseLocalDate, startOfWeek } from "./date";

describe("local date keys in Asia/Tokyo", () => {
  it("does not roll local midnight back to the previous UTC day", () => {
    expect(formatLocalDate(new Date(2026, 6, 19))).toBe("2026-07-19");
  });

  it("formats Japan dates independently of the server timezone", () => {
    expect(formatDateInTimeZone(new Date("2026-07-18T16:00:00.000Z"))).toBe("2026-07-19");
  });

  it("handles month, year, and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("uses Monday as the start of week", () => {
    expect(startOfWeek("2026-07-19")).toBe("2026-07-13");
    expect(startOfWeek("2026-07-20")).toBe("2026-07-20");
  });

  it("creates UTC timestamp bounds from local midnight", () => {
    expect(localDayUtcRange("2026-07-19")).toEqual({
      start: "2026-07-18T15:00:00.000Z",
      endExclusive: "2026-07-19T15:00:00.000Z",
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(() => parseLocalDate("2026-02-30")).toThrow("Invalid date key");
  });
});
