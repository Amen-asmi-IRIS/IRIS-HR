import { HttpResponse } from "msw";
import type { FieldProblem } from "@/api/problem";
import type { Me, Role } from "@/api/types";

const WORKSPACE_OF_ROLE: Record<Role, string> = { employee: "me", manager: "team", hr: "hr", exec: "overview", sysadmin: "admin" };

/** A signed-in user. Workspaces follow the roles unless given. */
export function makeMe(overrides: Partial<Me> = {}): Me {
  const roles = (overrides.roles ?? ["sysadmin"]) as Role[];
  return {
    public_id: "11111111-1111-4111-8111-111111111111",
    email: "sysadmin@impactrisks.com",
    name: "Samia Admin",
    language: "fr",
    roles,
    workspaces: roles.map((role) => WORKSPACE_OF_ROLE[role]),
    last_workspace: "",
    must_change_password: false,
    previous_login_at: "2026-10-04T08:15:00+01:00",
    password_reset: null,
    employee: null,
    environment: "development",
    version: "0.1.0",
    ...overrides,
  } as Me;
}

/** A page of a paginated list, as master 7.1 describes it. */
export function makePage<T>(results: T[], count: number = results.length) {
  return { count, next: null, previous: null, results };
}

/** An error answer in the problem format of master 6.2. */
export function problemResponse(status: number, code: string, detail: string, fields: Partial<FieldProblem>[] = []) {
  const entries = fields.length > 0 ? fields : [{ field: null }];
  const errors = entries.map((entry) => ({
    field: entry.field ?? null,
    code: entry.code ?? code,
    detail: entry.detail ?? detail,
    params: entry.params ?? {},
  }));
  return HttpResponse.json(
    { type: `urn:iris-hr:problem:${code}`, title: "Error", status, code, detail, errors, request_id: "req-test" },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
