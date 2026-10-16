import { describe, expect, it } from "vitest";
import { REPORT_DEFINITIONS, defaultQuery, filtersFor, findReport, reportsFor, scopeOf } from "./definitions";

const names = (workspace: "team" | "hr" | "overview") => reportsFor(workspace).map((report) => report.name);

describe("report definitions", () => {
  it("gives My team five reports, the HR desk six and Overview five", () => {
    expect(names("team")).toEqual(["absences", "balances", "waiting", "permission-hours", "remote-days"]);
    expect(names("hr")).toEqual([...names("team"), "certificates"]);
    expect(names("overview")).toEqual(names("team"));
  });

  it("never shows more than three filters at once", () => {
    for (const definition of REPORT_DEFINITIONS) {
      expect(definition.visible.length).toBeLessThanOrEqual(3);
    }
  });

  it("has no department filter in My team", () => {
    const absences = findReport("absences", "team")!;
    const balances = findReport("balances", "team")!;

    expect(filtersFor(absences, "team")).toEqual({ visible: ["period", "employee", "type"], more: [] });
    expect(filtersFor(balances, "team")).toEqual({ visible: ["on", "employee"], more: [] });
    expect(filtersFor(absences, "hr")).toEqual({ visible: ["period", "employee", "type"], more: ["department"] });
  });

  it("does not find a report outside its workspaces", () => {
    expect(findReport("certificates", "overview")).toBeUndefined();
    expect(findReport("payroll", "hr")).toBeUndefined();
    expect(findReport(undefined, "hr")).toBeUndefined();
  });

  it("maps a workspace to the scope the API expects", () => {
    expect(scopeOf("team")).toBe("team");
    expect(scopeOf("hr")).toBe("all");
    expect(scopeOf("overview")).toBe("all");
  });

  it("starts each report on a sensible selection", () => {
    const today = new Date(2026, 10, 18);

    expect(defaultQuery(findReport("absences", "hr")!, today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(defaultQuery(findReport("balances", "hr")!, today)).toEqual({ on: "2026-11-18" });
    expect(defaultQuery(findReport("remote-days", "hr")!, today)).toEqual({ year: "2026" });
    expect(defaultQuery(findReport("waiting", "hr")!, today)).toEqual({});
  });
});
