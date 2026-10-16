import { lazy } from "react";
import type { RouteObject } from "react-router";
import { oversightRoutes } from "@/features/reports/oversight/routes";

const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
const EmployeesPage = lazy(() => import("@/features/employees/EmployeesPage"));
const OverviewRequestsPage = lazy(() => import("@/features/requests/overview/OverviewRequestsPage"));
const RequestPage = lazy(() => import("@/features/requests/RequestPage"));
const OverviewCalendarPage = lazy(() => import("@/features/calendar/pages/OverviewCalendarPage"));
const ReportsIndexPage = lazy(() => import("@/features/reports/ReportsIndexPage"));
const ReportPage = lazy(() => import("@/features/reports/ReportPage"));

// Pages of Overview, with paths relative to /overview. A plan adds a page by appending an element.
export const overviewRoutes: RouteObject[] = [
  { path: "people/:id", element: <EmployeeRecordPage mode="overview" /> },
  { path: "people", element: <EmployeesPage mode="overview" /> },
  { path: "requests", element: <OverviewRequestsPage /> },
  { path: "requests/:id", element: <RequestPage /> },
  { path: "calendar", element: <OverviewCalendarPage /> },
  { path: "reports", element: <ReportsIndexPage workspace="overview" /> },
  { path: "reports/:name", element: <ReportPage workspace="overview" /> },
  ...oversightRoutes,
];
