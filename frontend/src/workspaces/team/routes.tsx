import { lazy } from "react";
import type { RouteObject } from "react-router";

const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
const TeamPeoplePage = lazy(() => import("@/features/employees/TeamPeoplePage"));
const TeamRequestsPage = lazy(() => import("@/features/requests/team/TeamRequestsPage"));
const RequestPage = lazy(() => import("@/features/requests/RequestPage"));
const TeamCalendarPage = lazy(() => import("@/features/calendar/pages/TeamCalendarPage"));
const ReportsIndexPage = lazy(() => import("@/features/reports/ReportsIndexPage"));
const ReportPage = lazy(() => import("@/features/reports/ReportPage"));

// Pages of My team, with paths relative to /team. A plan adds a page by appending an element.
export const teamRoutes: RouteObject[] = [
  { path: "people/:id", element: <EmployeeRecordPage mode="team" /> },
  { path: "people", element: <TeamPeoplePage /> },
  { path: "requests", element: <TeamRequestsPage /> },
  { path: "requests/:id", element: <RequestPage /> },
  { path: "calendar", element: <TeamCalendarPage /> },
  { path: "reports", element: <ReportsIndexPage workspace="team" /> },
  { path: "reports/:name", element: <ReportPage workspace="team" /> },
];
