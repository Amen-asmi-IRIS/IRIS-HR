import { describe, expect, it } from "vitest";

import { applyFilters, offered, peopleIn, typesIn, withAll } from "./filters";
import { makeEntry, makeFeed } from "./fixtures";

const sana = makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, type_code: "sick", type_name: "Congé maladie", status: "approved" });
const karim = makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, type_code: "annual", type_name: "Congé annuel", status: "pending" });
const karimAgain = makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, type_code: "remote", type_name: "Télétravail", status: "approved", label: "remote" });
const feed = makeFeed({ entries: [sana, karim, karimAgain], holidays: [{ date: "2026-11-20", name: "Fête" }] });

describe("calendar filters", () => {
  it("lists each person once, by name", () => {
    expect(peopleIn(feed)).toEqual([{ value: "p2", label: "Karim Gharbi" }, { value: "p1", label: "Sana Trabelsi" }]);
    expect(peopleIn(undefined)).toEqual([]);
  });

  it("lists each known type once, by name", () => {
    expect(typesIn(feed)).toEqual([
      { value: "annual", label: "Congé annuel" }, { value: "sick", label: "Congé maladie" }, { value: "remote", label: "Télétravail" },
    ]);
    expect(typesIn(makeFeed({ entries: [makeEntry()] }))).toEqual([]);      // a label-only entry has no type to offer
  });

  it("puts the all choice first and falls back to it for a value that is not offered", () => {
    const options = withAll("Tout le monde", peopleIn(feed));
    expect(options[0]).toEqual({ value: "", label: "Tout le monde" });
    expect(offered("p1", options)).toBe("p1");
    expect(offered("gone", options)).toBe("");
  });

  it("narrows entries and keeps holidays", () => {
    const none = { person: "", type: "", status: "" };
    expect(applyFilters(feed, none)).toBe(feed);
    expect(applyFilters(feed, { ...none, person: "p2" })?.entries).toEqual([karim, karimAgain]);
    expect(applyFilters(feed, { ...none, type: "sick" })?.entries).toEqual([sana]);
    expect(applyFilters(feed, { ...none, status: "pending" })?.entries).toEqual([karim]);
    expect(applyFilters(feed, { person: "p2", type: "remote", status: "approved" })?.entries).toEqual([karimAgain]);
    expect(applyFilters(feed, { ...none, person: "p2" })?.holidays).toEqual(feed.holidays);
    expect(applyFilters(undefined, none)).toBeUndefined();
  });

  it("keeps HR's working week when it narrows the entries", () => {
    const sundayToThursday = makeFeed({ entries: feed.entries, working_week: [1, 2, 3, 4, 7] });
    expect(applyFilters(sundayToThursday, { person: "p2", type: "", status: "" })?.working_week).toEqual([1, 2, 3, 4, 7]);
  });
});
