import { lazy } from "react";
import type { RouteObject } from "react-router";
import { OversightFrame } from "./OversightFrame";
import OversightHubPage from "./OversightHubPage";
import OversightIndexPage from "./OversightIndexPage";

const AccountPage = lazy(() => import("@/features/accounts/AccountPage"));
const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const StatusPage = lazy(() => import("@/features/accounts/StatusPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));
const DepartmentsPositionsPage = lazy(() => import("@/features/employees/DepartmentsPositionsPage"));
const ActivityLogPage = lazy(() => import("@/features/reports/ActivityLogPage"));
const EventsPage = lazy(() => import("@/features/requests/settings/EventsPage"));
const HolidaysPage = lazy(() => import("@/features/requests/settings/HolidaysPage"));
const RequestTypesPage = lazy(() => import("@/features/requests/settings/RequestTypesPage"));
const TypeStepsPage = lazy(() => import("@/features/requests/settings/TypeStepsPage"));
const SettingsGroupPage = lazy(() => import("@/features/settings/SettingsGroupPage"));

const TOP = "/overview/oversight";
const HR = "/overview/oversight/hr-settings";
const SYSTEM = "/overview/oversight/system";

/**
 * Overview, Oversight (UI 8.6). Paths are relative to the Overview workspace. Every page that has
 * actions elsewhere is mounted with `readOnly`: nothing here can change anything.
 */
export const oversightRoutes: RouteObject[] = [
  { path: "oversight", element: <OversightIndexPage /> },
  {
    path: "oversight/activity",
    element: (
      <OversightFrame back={TOP}>
        <ActivityLogPage />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/security",
    element: (
      <OversightFrame back={TOP}>
        <AuditLogPage category="security" />
      </OversightFrame>
    ),
  },
  { path: "oversight/hr-settings", element: <OversightHubPage hub="hr-settings" /> },
  {
    path: "oversight/hr-settings/request-types",
    element: (
      <OversightFrame back={HR}>
        <RequestTypesPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/steps",
    element: (
      <OversightFrame back={HR}>
        <TypeStepsPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/events",
    element: (
      <OversightFrame back={HR}>
        <EventsPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/holidays",
    element: (
      <OversightFrame back={HR}>
        <HolidaysPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/parameters",
    element: (
      <OversightFrame back={HR}>
        <SettingsGroupPage group="hr" readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/departments",
    element: (
      <OversightFrame back={HR}>
        <DepartmentsPositionsPage readOnly />
      </OversightFrame>
    ),
  },
  { path: "oversight/system", element: <OversightHubPage hub="system" /> },
  {
    path: "oversight/system/status",
    element: (
      <OversightFrame back={SYSTEM}>
        <StatusPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/system/accounts",
    element: (
      <OversightFrame back={SYSTEM}>
        <AccountsPage readOnly />
      </OversightFrame>
    ),
  },
  // The account page links back to the list above by itself (a relative address, plan 01b).
  { path: "oversight/system/accounts/:id", element: <AccountPage readOnly /> },
  {
    path: "oversight/system/parameters",
    element: (
      <OversightFrame back={SYSTEM}>
        <SettingsGroupPage group="system" readOnly />
      </OversightFrame>
    ),
  },
];
