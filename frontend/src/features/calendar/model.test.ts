import { describe, expect, it } from "vitest";

import { makeEntry, makeFeed } from "./fixtures";
import { entriesOn, fromIso, holidayOn, isWeekend, partForDay, rangeFor, shiftAnchor, toIso, weeksFor } from "./model";

const day = (iso: string) => fromIso(iso);

describe("ranges and grids", () => {
  it("covers whole weeks around a month, Monday first", () => {
    const { from, to } = rangeFor("month", day("2026-11-15"));
    expect(toIso(from)).toBe("2026-10-26");      // the Monday before 1 November (a Sunday)
    expect(toIso(to)).toBe("2026-12-06");        // the Sunday after 30 November (a Monday)
  });

  it("covers Monday to Sunday for a week", () => {
    const { from, to } = rangeFor("week", day("2026-11-04"));
    expect([toIso(from), toIso(to)]).toEqual(["2026-11-02", "2026-11-08"]);
  });

  it("builds rows of seven days", () => {
    const month = weeksFor("month", day("2026-11-15"));
    expect(month).toHaveLength(6);
    expect(month.every((week) => week.length === 7)).toBe(true);
    expect(toIso(month[1][0])).toBe("2026-11-02");
    expect(weeksFor("week", day("2026-11-04"))).toHaveLength(1);
  });

  it("moves by a month or by a week", () => {
    expect(toIso(shiftAnchor("month", day("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIso(shiftAnchor("month", day("2026-11-15"), -1))).toBe("2026-10-15");
    expect(toIso(shiftAnchor("week", day("2026-12-30"), 1))).toBe("2027-01-06");
  });

  it("knows the weekend", () => {
    expect(isWeekend(day("2026-11-07"))).toBe(true);
    expect(isWeekend(day("2026-11-08"))).toBe(true);
    expect(isWeekend(day("2026-11-09"))).toBe(false);
  });
});

describe("partForDay", () => {
  const leave = makeEntry({ start_date: "2026-11-03", end_date: "2026-11-05" });

  it("is null outside the entry", () => {
    expect(partForDay(leave, "2026-11-02")).toBeNull();
    expect(partForDay(leave, "2026-11-06")).toBeNull();
  });

  it("is a full day inside a plain entry", () => {
    expect(["2026-11-03", "2026-11-04", "2026-11-05"].map((iso) => partForDay(leave, iso))).toEqual(["full", "full", "full"]);
  });

  it("starts with an afternoon and ends with a morning when flagged", () => {
    const flagged = { ...leave, starts_at_midday: true, ends_at_midday: true };
    expect(partForDay(flagged, "2026-11-03")).toBe("afternoon");
    expect(partForDay(flagged, "2026-11-04")).toBe("full");
    expect(partForDay(flagged, "2026-11-05")).toBe("morning");
  });

  it("reads a single day as a morning or an afternoon", () => {
    const single = makeEntry({ start_date: "2026-11-04", end_date: "2026-11-04" });
    expect(partForDay({ ...single, ends_at_midday: true }, "2026-11-04")).toBe("morning");
    expect(partForDay({ ...single, starts_at_midday: true }, "2026-11-04")).toBe("afternoon");
    expect(partForDay(single, "2026-11-04")).toBe("full");
  });
});

describe("entriesOn", () => {
  const colleague = makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, start_date: "2026-11-06", end_date: "2026-11-10" });
  const mine = makeEntry({ employee: { public_id: "me", name: "Amine Jaziri" }, start_date: "2026-11-09", end_date: "2026-11-09", mine: true });
  const feed = makeFeed({ entries: [colleague, mine], holidays: [{ date: "2026-11-10", name: "Jour férié" }] });

  it("lists the entries that cover a working day, own entries first", () => {
    expect(entriesOn(feed, day("2026-11-06")).map((item) => item.entry.employee.name)).toEqual(["Sana Trabelsi"]);
    expect(entriesOn(feed, day("2026-11-09")).map((item) => item.entry.employee.name)).toEqual(["Amine Jaziri", "Sana Trabelsi"]);
  });

  it("shows nobody on a weekend or on a public holiday", () => {
    expect(entriesOn(feed, day("2026-11-07"))).toEqual([]);
    expect(entriesOn(feed, day("2026-11-08"))).toEqual([]);
    expect(entriesOn(feed, day("2026-11-10"))).toEqual([]);
  });

  it("finds the holiday of a day", () => {
    expect(holidayOn(feed.holidays, "2026-11-10")?.name).toBe("Jour férié");
    expect(holidayOn(feed.holidays, "2026-11-11")).toBeUndefined();
  });
});

describe("the working week of the feed", () => {
  const sundayToThursday = [1, 2, 3, 4, 7];

  it("takes the days off from the feed, Monday to Friday without one", () => {
    expect(isWeekend(day("2026-11-06"))).toBe(false);                        // a Friday, usually worked
    expect(isWeekend(day("2026-11-06"), sundayToThursday)).toBe(true);
    expect(isWeekend(day("2026-11-07"), sundayToThursday)).toBe(true);       // Saturday
    expect(isWeekend(day("2026-11-08"), sundayToThursday)).toBe(false);      // Sunday is worked
  });

  it("shows nobody on a day off and somebody on a worked Sunday", () => {
    const away = makeEntry({ start_date: "2026-11-05", end_date: "2026-11-09" });
    const feed = makeFeed({ entries: [away], working_week: sundayToThursday });
    expect(entriesOn(feed, day("2026-11-06"))).toEqual([]);                  // Friday
    expect(entriesOn(feed, day("2026-11-08"))).toHaveLength(1);              // Sunday
    expect(entriesOn(makeFeed({ entries: [away] }), day("2026-11-08"))).toEqual([]);   // the usual week
  });
});
