import { lazy } from "react";
import type { RouteObject } from "react-router";

const EmployeesPage = lazy(() => import("@/features/employees/EmployeesPage"));
const EmployeeFormPage = lazy(() => import("@/features/employees/EmployeeFormPage"));
const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
const HrSettingsIndexPage = lazy(() => import("@/features/settings/HrSettingsIndexPage"));
const DepartmentsPositionsPage = lazy(() => import("@/features/employees/DepartmentsPositionsPage"));
const ProfileChangesPage = lazy(() => import("@/features/profile/ProfileChangesPage"));
const ToValidatePage = lazy(() => import("@/features/requests/queues/ToValidatePage"));
const CertificatesPage = lazy(() => import("@/features/requests/queues/CertificatesPage"));
const StuckPage = lazy(() => import("@/features/requests/queues/StuckPage"));
const HrRequestsPage = lazy(() => import("@/features/requests/hr/HrRequestsPage"));
const HrNewRequestPage = lazy(() => import("@/features/requests/hr/HrNewRequestPage"));
const RequestPage = lazy(() => import("@/features/requests/RequestPage"));
const EditRequestPage = lazy(() => import("@/features/requests/form/EditRequestPage"));
const RequestTypesPage = lazy(() => import("@/features/requests/settings/RequestTypesPage"));
const TypeStepsPage = lazy(() => import("@/features/requests/settings/TypeStepsPage"));
const EventsPage = lazy(() => import("@/features/requests/settings/EventsPage"));
const HolidaysPage = lazy(() => import("@/features/requests/settings/HolidaysPage"));
const SettingsGroupPage = lazy(() => import("@/features/settings/SettingsGroupPage"));
const HrCalendarPage = lazy(() => import("@/features/calendar/pages/HrCalendarPage"));
const ReportsIndexPage = lazy(() => import("@/features/reports/ReportsIndexPage"));
const ReportPage = lazy(() => import("@/features/reports/ReportPage"));
const KpmgExportPage = lazy(() => import("@/features/reports/KpmgExportPage"));
const ActivityLogPage = lazy(() => import("@/features/reports/ActivityLogPage"));

// Pages of the HR desk, with paths relative to /hr. A plan adds a page by appending an element.
export const hrRoutes: RouteObject[] = [
  { path: "employees", element: <EmployeesPage mode="hr" /> },
  { path: "employees/new", element: <EmployeeFormPage /> },
  { path: "employees/:id/edit", element: <EmployeeFormPage /> },
  { path: "employees/:id", element: <EmployeeRecordPage mode="hr" /> },
  { path: "settings", element: <HrSettingsIndexPage /> },
  { path: "settings/departments", element: <DepartmentsPositionsPage /> },
  { path: "profile-changes", element: <ProfileChangesPage /> },
  { path: "validate", element: <ToValidatePage /> },
  { path: "certificates", element: <CertificatesPage /> },
  { path: "stuck", element: <StuckPage /> },
  { path: "requests", element: <HrRequestsPage /> },
  { path: "requests/new", element: <HrNewRequestPage /> },
  { path: "requests/:id", element: <RequestPage /> },
  { path: "requests/:id/edit", element: <EditRequestPage mode="hr" /> },
  { path: "settings/request-types", element: <RequestTypesPage /> },
  { path: "settings/steps", element: <TypeStepsPage /> },
  { path: "settings/events", element: <EventsPage /> },
  { path: "settings/holidays", element: <HolidaysPage /> },
  { path: "settings/parameters", element: <SettingsGroupPage group="hr" /> },
  { path: "calendar", element: <HrCalendarPage /> },
  { path: "reports", element: <ReportsIndexPage workspace="hr" /> },
  { path: "reports/:name", element: <ReportPage workspace="hr" /> },
  { path: "reports/kpmg", element: <KpmgExportPage /> },
  { path: "reports/activity", element: <ActivityLogPage /> },
];
