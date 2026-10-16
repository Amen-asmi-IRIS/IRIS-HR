import { matchPath, type RouteObject } from "react-router";
import type { Me } from "@/api/types";
import { adminRoutes } from "@/workspaces/admin/routes";
import { hrRoutes } from "@/workspaces/hr/routes";
import { meRoutes } from "@/workspaces/me/routes";
import { overviewRoutes } from "@/workspaces/overview/routes";
import { teamRoutes } from "@/workspaces/team/routes";
import { HOMES } from "./homes";
import { sharedRoutes } from "./sharedRoutes";
import { LANDING_ORDER, WORKSPACE_IDS, WORKSPACES, type NavEntry, type WorkspaceId } from "./workspaces";

export const WORKSPACE_ROUTES: Record<WorkspaceId, RouteObject[]> = {
  me: meRoutes,
  team: teamRoutes,
  hr: hrRoutes,
  overview: overviewRoutes,
  admin: adminRoutes,
};

/** What exists: the pages of each workspace and which workspaces have a home. */
export interface Registry {
  routes: Record<WorkspaceId, RouteObject[]>;
  homes: Partial<Record<WorkspaceId, unknown>>;
}

const BUILT: Registry = { routes: WORKSPACE_ROUTES, homes: HOMES };

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === "string" && (WORKSPACE_IDS as string[]).includes(value);
}

/** The entries of a workspace that lead somewhere: its home once one is registered, the others once a route has their path. */
export function visibleNav(id: WorkspaceId, registry: Registry = BUILT): NavEntry[] {
  const workspace = WORKSPACES[id];
  return workspace.nav.filter((entry) => {
    if (entry.path === workspace.home) return Boolean(registry.homes[id]);
    const relative = entry.path.slice(workspace.home.length + 1);
    return registry.routes[id].some((route) => route.path === relative);
  });
}

/** The workspaces offered to a person: those their roles give and that have at least one page. */
export function availableWorkspaces(me: Pick<Me, "workspaces">, registry: Registry = BUILT): WorkspaceId[] {
  const granted = me.workspaces as readonly string[];
  return WORKSPACE_IDS.filter((id) => granted.includes(id) && visibleNav(id, registry).length > 0);
}

/** The workspace used last when it is still available, otherwise the most specific one (UI 3.2). */
export function landingWorkspace(me: Pick<Me, "workspaces" | "last_workspace">, registry: Registry = BUILT): WorkspaceId | null {
  const available = availableWorkspaces(me, registry);
  if (isWorkspaceId(me.last_workspace) && available.includes(me.last_workspace)) return me.last_workspace;
  return LANDING_ORDER.find((id) => available.includes(id)) ?? null;
}

export function workspaceOfPath(pathname: string): WorkspaceId | null {
  const first = pathname.split("/")[1];
  return isWorkspaceId(first) ? first : null;
}

function collect(routes: RouteObject[], prefix: string, out: string[]): void {
  for (const route of routes) {
    const path = route.path ? `${prefix}/${route.path}`.replace(/\/+/g, "/") : prefix;
    if (route.path) out.push(path);
    if (route.children) collect(route.children, path, out);
  }
}

/** Every registered address pattern, absolute. */
export function routePatterns(registry: Registry = BUILT, shared: RouteObject[] = sharedRoutes): string[] {
  const out = ["/", "/login", "/password/new"];
  collect(shared, "", out);
  for (const id of WORKSPACE_IDS) {
    out.push(`/${id}`);
    collect(registry.routes[id], `/${id}`, out);
  }
  return out;
}

/** The registered pattern an address falls under, the most specific first; "*" when there is none. */
export function patternFor(pathname: string, patterns: string[] = routePatterns()): string {
  const dynamicParts = (pattern: string) => pattern.split("/").filter((part) => part.startsWith(":") || part === "*").length;
  const matches = patterns.filter((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
  matches.sort((a, b) => dynamicParts(a) - dynamicParts(b));
  return matches[0] ?? "*";
}
