import type { Fixtures } from "./data";
import type { Persona } from "./session";

export interface PageSpec {
  id: string;
  persona: Persona;
  path: string | ((fixtures: Fixtures) => string);
  home?: boolean;                                 // a workspace home (at most four blocks)
}

const REPORTS = ["absences", "balances", "waiting", "permission-hours", "remote-days"];

export const PAGES: PageSpec[] = [
  { id: "change password", persona: "owner", path: "/password" },
  { id: "notifications", persona: "owner", path: "/notifications" },
  { id: "not available", persona: "owner", path: "/me/requests/00000000-0000-4000-8000-000000000000" },
  // My space
  { id: "me: home", persona: "owner", path: "/me", home: true },
  { id: "me: requests", persona: "owner", path: "/me/requests" },
  { id: "me: new request, the kind", persona: "owner", path: "/me/requests/new" },
  { id: "me: new request, the form", persona: "owner", path: "/me/requests/new?type=remote" },
  { id: "me: edit request", persona: "owner", path: (f) => `/me/requests/${f.draft}/edit` },
  { id: "me: request", persona: "owner", path: (f) => `/me/requests/${f.pending}` },
  { id: "me: change or cancel", persona: "owner", path: (f) => `/me/requests/${f.approved}/change` },
  { id: "me: calendar", persona: "owner", path: "/me/calendar" },
  { id: "me: balance", persona: "owner", path: "/me/balance" },
  { id: "me: profile", persona: "owner", path: "/me/profile" },
  { id: "me: propose a change", persona: "owner", path: "/me/profile/change" },
  // My team
  { id: "team: to decide", persona: "manager", path: "/team", home: true },
  { id: "team: request", persona: "manager", path: (f) => `/team/requests/${f.pending}` },
  { id: "team: people", persona: "manager", path: "/team/people" },
  { id: "team: person", persona: "manager", path: (f) => `/team/people/${f.ownerEmployee}` },
  { id: "team: requests", persona: "manager", path: "/team/requests" },
  { id: "team: calendar", persona: "manager", path: "/team/calendar" },
  { id: "team: delegations", persona: "manager", path: "/team/delegations" },
  { id: "team: reports", persona: "manager", path: "/team/reports" },
  ...REPORTS.map((name): PageSpec => ({ id: `team: report ${name}`, persona: "manager", path: `/team/reports/${name}` })),
  // HR desk
  { id: "hr: desk", persona: "hr", path: "/hr", home: true },
  { id: "hr: to validate", persona: "hr", path: "/hr/validate" },
  { id: "hr: certificates", persona: "hr", path: "/hr/certificates" },
  { id: "hr: stuck", persona: "hr", path: "/hr/stuck" },
  { id: "hr: profile changes", persona: "hr", path: "/hr/profile-changes" },
  { id: "hr: requests", persona: "hr", path: "/hr/requests" },
  { id: "hr: new request", persona: "hr", path: "/hr/requests/new" },
  { id: "hr: request", persona: "hr", path: (f) => `/hr/requests/${f.approved}` },
  { id: "hr: employees", persona: "hr", path: "/hr/employees" },
  { id: "hr: new employee", persona: "hr", path: "/hr/employees/new" },
  { id: "hr: employee record", persona: "hr", path: (f) => `/hr/employees/${f.ownerEmployee}` },
  { id: "hr: edit employee", persona: "hr", path: (f) => `/hr/employees/${f.ownerEmployee}/edit` },
  { id: "hr: calendar", persona: "hr", path: "/hr/calendar" },
  { id: "hr: reports", persona: "hr", path: "/hr/reports" },
  ...[...REPORTS, "certificates"].map((name): PageSpec => ({ id: `hr: report ${name}`, persona: "hr", path: `/hr/reports/${name}` })),
  { id: "hr: kpmg export", persona: "hr", path: "/hr/reports/kpmg" },
  { id: "hr: activity log", persona: "hr", path: "/hr/reports/activity" },
  { id: "hr: settings", persona: "hr", path: "/hr/settings" },
  ...["departments", "request-types", "steps", "events", "holidays", "parameters"].map(
    (subject): PageSpec => ({ id: `hr: settings ${subject}`, persona: "hr", path: `/hr/settings/${subject}` })),
  // Overview
  { id: "overview: home", persona: "ceo", path: "/overview", home: true },
  { id: "overview: people", persona: "ceo", path: "/overview/people" },
  { id: "overview: person", persona: "ceo", path: (f) => `/overview/people/${f.ownerEmployee}` },
  { id: "overview: requests", persona: "ceo", path: "/overview/requests" },
  { id: "overview: request", persona: "ceo", path: (f) => `/overview/requests/${f.approved}` },
  { id: "overview: calendar", persona: "ceo", path: "/overview/calendar" },
  { id: "overview: reports", persona: "ceo", path: "/overview/reports" },
  ...REPORTS.map((name): PageSpec => ({ id: `overview: report ${name}`, persona: "ceo", path: `/overview/reports/${name}` })),
  { id: "overview: oversight", persona: "ceo", path: "/overview/oversight" },
  { id: "overview: oversight, activity log", persona: "ceo", path: "/overview/oversight/activity" },
  { id: "overview: oversight, security log", persona: "ceo", path: "/overview/oversight/security" },
  // Administration
  { id: "admin: status", persona: "sysadmin", path: "/admin", home: true },
  { id: "admin: accounts", persona: "sysadmin", path: "/admin/accounts" },
  { id: "admin: create account", persona: "sysadmin", path: "/admin/accounts/new" },
  { id: "admin: account", persona: "sysadmin", path: (f) => `/admin/accounts/${f.ownerAccount}` },
  { id: "admin: parameters", persona: "sysadmin", path: "/admin/parameters" },
  { id: "admin: security log", persona: "sysadmin", path: "/admin/security-log" },
];

/** Pages whose links lead to read-only copies of other pages (plan 06); the spec follows each link once. */
export const HUBS: { id: string; persona: Persona; path: string }[] = [
  { id: "overview: oversight, HR settings", persona: "ceo", path: "/overview/oversight/hr-settings" },
  { id: "overview: oversight, accounts and system", persona: "ceo", path: "/overview/oversight/system" },
];

export function resolve(spec: PageSpec, fixtures: Fixtures): string {
  return typeof spec.path === "function" ? spec.path(fixtures) : spec.path;
}
