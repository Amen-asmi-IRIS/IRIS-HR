import { describe, expect, it } from "vitest";
import { addDaysISO, isISODate, todayISO } from "./dates";

describe("dates", () => {
  it("gives today's date in Tunis, not in UTC", () => {
    expect(todayISO(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
    expect(todayISO(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-06");
  });

  it("adds days across a month and a year", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("recognises a real calendar date only", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("28/02/2026")).toBe(false);
    expect(isISODate("")).toBe(false);
  });
});
