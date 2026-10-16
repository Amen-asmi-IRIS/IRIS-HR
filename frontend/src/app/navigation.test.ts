import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { availableWorkspaces, isWorkspaceId, landingWorkspace, patternFor, routePatterns, visibleNav, workspaceOfPath, type Registry } from "./navigation";
import { LANDING_ORDER, WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from "./workspaces";

function registry(routes: Partial<Record<WorkspaceId, RouteObject[]>>, homes: WorkspaceId[] = []): Registry {
  return {
    routes: { me: [], team: [], hr: [], overview: [], admin: [], ...routes },
    homes: Object.fromEntries(homes.map((id) => [id, true])),
  };
}

const page = (path: string): RouteObject => ({ path, element: null });

describe("the workspaces of the UI document", () => {
  it("are five, each with at most six entries under its own address", () => {
    expect(WORKSPACE_IDS).toEqual(["me", "team", "hr", "overview", "admin"]);
    expect(LANDING_ORDER).toEqual(["admin", "hr", "overview", "team", "me"]);
    for (const id of WORKSPACE_IDS) {
      const workspace = WORKSPACES[id];
      expect(workspace.home).toBe(`/${id}`);
      expect(workspace.nav.length).toBeLessThanOrEqual(6);
      expect(workspace.nav[0].path).toBe(workspace.home);
      for (const entry of workspace.nav) expect(entry.path === workspace.home || entry.path.startsWith(`${workspace.home}/`)).toBe(true);
    }
    expect(WORKSPACES.admin.nav.map((entry) => entry.path)).toEqual(["/admin", "/admin/accounts", "/admin/parameters", "/admin/security-log"]);
    expect(WORKSPACES.me.nav.map((entry) => entry.path)).toEqual(["/me", "/me/requests", "/me/calendar", "/me/balance", "/me/profile"]);
  });
});

describe("visibleNav", () => {
  it("shows an entry only when a page exists for it", () => {
    const only = registry({ admin: [page("accounts"), page("accounts/new"), page("accounts/:id")] });
    expect(visibleNav("admin", only).map((entry) => entry.path)).toEqual(["/admin/accounts"]);
  });

  it("shows the home entry only when a home is registered", () => {
    const withHome = registry({ admin: [page("accounts")] }, ["admin"]);
    expect(visibleNav("admin", withHome).map((entry) => entry.path)).toEqual(["/admin", "/admin/accounts"]);
    expect(visibleNav("me", withHome)).toEqual([]);
  });
});

describe("availableWorkspaces", () => {
  it("needs both the role and at least one page", () => {
    const built = registry({ admin: [page("accounts")], team: [page("people")] });
    expect(availableWorkspaces(makeMe({ roles: ["sysadmin"] }), built)).toEqual(["admin"]);
    expect(availableWorkspaces(makeMe({ roles: ["employee", "manager"] }), built)).toEqual(["team"]);
    expect(availableWorkspaces(makeMe({ roles: ["employee"] }), built)).toEqual([]);
  });

  it("lists them in the order of the switcher", () => {
    const built = registry({ me: [page("profile")], team: [page("people")], overview: [page("people")] });
    expect(availableWorkspaces(makeMe({ roles: ["exec", "manager", "employee"] }), built)).toEqual(["me", "team", "overview"]);
  });
});

describe("landingWorkspace", () => {
  const built = registry({ me: [page("profile")], team: [page("people")], hr: [page("employees")], admin: [page("accounts")] });

  it("is the workspace used last, when it is still available", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager", "hr"], last_workspace: "me" }), built)).toBe("me");
  });

  it("is the most specific workspace on a first sign-in", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager", "hr"], last_workspace: "" }), built)).toBe("hr");
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager"], last_workspace: "" }), built)).toBe("team");
  });

  it("ignores a last workspace the person no longer has", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee"], last_workspace: "hr" }), built)).toBe("me");
  });

  it("is nothing for a person without any workspace", () => {
    expect(landingWorkspace(makeMe({ roles: [] }), built)).toBeNull();
  });
});

describe("addresses", () => {
  it("tell which workspace a page belongs to", () => {
    expect(workspaceOfPath("/admin/accounts/abc")).toBe("admin");
    expect(workspaceOfPath("/me")).toBe("me");
    expect(workspaceOfPath("/notifications")).toBeNull();
    expect(isWorkspaceId("hr")).toBe(true);
    expect(isWorkspaceId("root")).toBe(false);
  });

  it("resolve to the most specific registered pattern", () => {
    const built = registry({ admin: [page("accounts"), page("accounts/new"), page("accounts/:id")] });
    const patterns = routePatterns(built, [page("/requests/:id")]);
    expect(patternFor("/admin/accounts/new", patterns)).toBe("/admin/accounts/new");
    expect(patternFor("/admin/accounts/abc", patterns)).toBe("/admin/accounts/:id");
    expect(patternFor("/requests/r1", patterns)).toBe("/requests/:id");
    expect(patternFor("/login", patterns)).toBe("/login");
    expect(patternFor("/nowhere/at/all", patterns)).toBe("*");
  });
});
