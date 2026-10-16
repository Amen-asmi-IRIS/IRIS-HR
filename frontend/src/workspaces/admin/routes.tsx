import { lazy } from "react";
import type { RouteObject } from "react-router";

const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const CreateAccountPage = lazy(() => import("@/features/accounts/CreateAccountPage"));
const AccountPage = lazy(() => import("@/features/accounts/AccountPage"));
const SettingsGroupPage = lazy(() => import("@/features/settings/SettingsGroupPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [
  { path: "accounts", element: <AccountsPage /> },
  { path: "accounts/new", element: <CreateAccountPage /> },
  { path: "accounts/:id", element: <AccountPage /> },
  { path: "parameters", element: <SettingsGroupPage group="system" /> },
  { path: "security-log", element: <AuditLogPage category="security" /> },
];
