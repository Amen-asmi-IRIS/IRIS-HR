import { describe, expect, it } from "vitest";

import { formatDayLong, formatPeriodTitle, weekdayNames } from "./dates";
import { fromIso } from "./model";

describe("calendar dates", () => {
  it("names a day in French and in English", () => {
    expect(formatDayLong(fromIso("2026-11-02"), "fr")).toBe("lundi 2 novembre 2026");
    expect(formatDayLong(fromIso("2026-11-02"), "en")).toBe("Monday 2 November 2026");
  });

  it("titles a month and a week", () => {
    expect(formatPeriodTitle("month", fromIso("2026-11-15"), "fr")).toBe("novembre 2026");
    expect(formatPeriodTitle("month", fromIso("2026-11-15"), "en")).toBe("November 2026");
    expect(formatPeriodTitle("week", fromIso("2026-11-04"), "fr")).toBe("2 – 8 novembre 2026");
    expect(formatPeriodTitle("week", fromIso("2026-11-30"), "en")).toBe("30 November – 6 December 2026");
  });

  it("lists the weekdays from Monday", () => {
    expect(weekdayNames("fr").map((name) => name.long)).toEqual(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
    expect(weekdayNames("en")[0]).toEqual({ short: "Mon", long: "Monday" });
  });

});
