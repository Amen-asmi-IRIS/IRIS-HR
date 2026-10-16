import {
  Activity,
  Calendar,
  ClipboardList,
  Eye,
  FileText,
  House,
  Inbox,
  KeyRound,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceId = "me" | "team" | "hr" | "overview" | "admin";

export interface NavEntry {
  path: string;
  labelKey: string;
  /**
   * The label of the phone tab bar, when the full label does not fit there: at 360 px a tab is 90 px wide with
   * four tabs and 72 px with five, its label included. Past five entries the first four have a tab and the
   * others are listed under "More" with their full label. The desktop sidebar keeps `labelKey`.
   */
  shortLabelKey?: string;
  icon: LucideIcon;
}

export interface Workspace {
  id: WorkspaceId;
  labelKey: string;
  home: string;
  nav: NavEntry[];
}

/** The order of the switcher (UI 3.1). */
export const WORKSPACE_IDS: WorkspaceId[] = ["me", "team", "hr", "overview", "admin"];

/** Most specific first: where a person lands on a first sign-in (UI 3.2). */
export const LANDING_ORDER: WorkspaceId[] = ["admin", "hr", "overview", "team", "me"];

/**
 * The complete navigation of the UI document. An entry is drawn only once a page exists for it
 * (see navigation.ts), so plans add pages and never edit this file.
 */
export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  me: {
    id: "me",
    labelKey: "nav:workspaces.me",
    home: "/me",
    nav: [
      { path: "/me", labelKey: "nav:me.home", icon: House },
      { path: "/me/requests", labelKey: "nav:me.requests", icon: FileText },
      { path: "/me/calendar", labelKey: "nav:me.calendar", icon: Calendar },
      { path: "/me/balance", labelKey: "nav:me.balance", icon: Wallet },
      { path: "/me/profile", labelKey: "nav:me.profile", icon: User },
    ],
  },
  team: {
    id: "team",
    labelKey: "nav:workspaces.team",
    home: "/team",
    nav: [
      { path: "/team", labelKey: "nav:team.decide", icon: Inbox },
      { path: "/team/people", labelKey: "nav:team.people", icon: Users },
      { path: "/team/requests", labelKey: "nav:team.requests", icon: FileText },
      { path: "/team/calendar", labelKey: "nav:team.calendar", icon: Calendar },
      { path: "/team/reports", labelKey: "nav:team.reports", icon: TrendingUp },
    ],
  },
  hr: {
    id: "hr",
    labelKey: "nav:workspaces.hr",
    home: "/hr",
    nav: [
      { path: "/hr", labelKey: "nav:hr.desk", icon: ClipboardList },
      { path: "/hr/requests", labelKey: "nav:hr.requests", icon: FileText },
      { path: "/hr/employees", labelKey: "nav:hr.employees", icon: Users },
      { path: "/hr/calendar", labelKey: "nav:hr.calendar", icon: Calendar },
      { path: "/hr/reports", labelKey: "nav:hr.reports", icon: TrendingUp },
      { path: "/hr/settings", labelKey: "nav:hr.settings", shortLabelKey: "nav:short.hr.settings", icon: Settings },
    ],
  },
  overview: {
    id: "overview",
    labelKey: "nav:workspaces.overview",
    home: "/overview",
    nav: [
      { path: "/overview", labelKey: "nav:overview.home", shortLabelKey: "nav:short.overview.home", icon: Eye },
      { path: "/overview/people", labelKey: "nav:overview.people", icon: Users },
      { path: "/overview/requests", labelKey: "nav:overview.requests", icon: FileText },
      { path: "/overview/calendar", labelKey: "nav:overview.calendar", icon: Calendar },
      { path: "/overview/reports", labelKey: "nav:overview.reports", icon: TrendingUp },
      { path: "/overview/oversight", labelKey: "nav:overview.oversight", icon: ShieldCheck },
    ],
  },
  admin: {
    id: "admin",
    labelKey: "nav:workspaces.admin",
    home: "/admin",
    nav: [
      { path: "/admin", labelKey: "nav:admin.status", icon: Activity },
      { path: "/admin/accounts", labelKey: "nav:admin.accounts", icon: KeyRound },
      { path: "/admin/parameters", labelKey: "nav:admin.parameters", icon: SlidersHorizontal },
      { path: "/admin/security-log", labelKey: "nav:admin.securityLog", shortLabelKey: "nav:short.admin.securityLog", icon: ShieldCheck },
    ],
  },
};
