import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { WorkspaceId } from "./workspaces";

// One line per workspace; a plan adds a line or replaces the value of a line.
export const HOMES: Partial<Record<WorkspaceId, LazyExoticComponent<ComponentType>>> = {
  admin: lazy(() => import("@/features/accounts/StatusPage")),
  team: lazy(() => import("@/features/home/TeamHomePage")),
  hr: lazy(() => import("@/features/home/HrDeskPage")),
  me: lazy(() => import("@/features/home/MeHomePage")),
  overview: lazy(() => import("@/features/home/OverviewHomePage")),
};
