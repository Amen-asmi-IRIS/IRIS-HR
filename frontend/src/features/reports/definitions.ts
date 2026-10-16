import type { ReportName } from "@/api/types";
import type { ReportQuery, ReportScope } from "./api";

export type ReportWorkspace = "team" | "hr" | "overview";
export type FilterKey = "period" | "on" | "year" | "department" | "employee" | "type" | "step";

export interface ReportDefinition {
  name: ReportName;
  workspaces: ReportWorkspace[];
  /** At most three (UI rule M5; plan 01b's FilterBar refuses a fourth). */
  visible: FilterKey[];
  /** One step away, behind "More filters". */
  more: FilterKey[];
}

const EVERYWHERE: ReportWorkspace[] = ["team", "hr", "overview"];

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { name: "absences", workspaces: EVERYWHERE, visible: ["period", "employee", "type"], more: ["department"] },
  { name: "balances", workspaces: EVERYWHERE, visible: ["on", "department", "employee"], more: [] },
  { name: "waiting", workspaces: EVERYWHERE, visible: ["department", "type", "step"], more: [] },
  { name: "permission-hours", workspaces: EVERYWHERE, visible: ["year", "department", "employee"], more: [] },
  { name: "remote-days", workspaces: EVERYWHERE, visible: ["year", "department", "employee"], more: [] },
  // Certificate status is HR's alone (UI 10.2 and 10.3), so Overview has five reports.
  { name: "certificates", workspaces: ["hr"], visible: ["department"], more: [] },
];

export function scopeOf(workspace: ReportWorkspace): ReportScope {
  return workspace === "team" ? "team" : "all";
}

export function reportsFor(workspace: ReportWorkspace): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((definition) => definition.workspaces.includes(workspace));
}

export function findReport(name: string | undefined, workspace: ReportWorkspace): ReportDefinition | undefined {
  return reportsFor(workspace).find((definition) => definition.name === name);
}

/** In My team a report is limited to the team and has no department filter (UI 10.3). */
export function filtersFor(
  definition: ReportDefinition,
  workspace: ReportWorkspace,
): { visible: FilterKey[]; more: FilterKey[] } {
  const keep = (key: FilterKey) => workspace !== "team" || key !== "department";
  return { visible: definition.visible.filter(keep), more: definition.more.filter(keep) };
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The selection a report opens on: the current month, today, or the current year. */
export function defaultQuery(definition: ReportDefinition, today: Date): ReportQuery {
  const keys = [...definition.visible, ...definition.more];
  const query: ReportQuery = {};
  if (keys.includes("period")) {
    query.from = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    query.to = toIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  }
  if (keys.includes("on")) query.on = toIsoDate(today);
  if (keys.includes("year")) query.year = String(today.getFullYear());
  return query;
}
