import { lazy } from "react";
import type { RouteObject } from "react-router";

const MyProfilePage = lazy(() => import("@/features/profile/MyProfilePage"));
const ProposeChangePage = lazy(() => import("@/features/profile/ProposeChangePage"));
const NewRequestPage = lazy(() => import("@/features/requests/form/NewRequestPage"));
const EditRequestPage = lazy(() => import("@/features/requests/form/EditRequestPage"));
const MyRequestsPage = lazy(() => import("@/features/requests/mine/MyRequestsPage"));
const RequestPage = lazy(() => import("@/features/requests/RequestPage"));
const ChangeOrCancelPage = lazy(() => import("@/features/requests/mine/ChangeOrCancelPage"));
const BalancePage = lazy(() => import("@/features/balances/BalancePage"));
const MeCalendarPage = lazy(() => import("@/features/calendar/pages/MeCalendarPage"));

// Pages of My space, with paths relative to /me. A plan adds a page by appending an element.
export const meRoutes: RouteObject[] = [
  { path: "profile", element: <MyProfilePage /> },
  { path: "profile/change", element: <ProposeChangePage /> },
  { path: "requests/new", element: <NewRequestPage /> },
  { path: "requests/:id/edit", element: <EditRequestPage /> },
  { path: "requests", element: <MyRequestsPage /> },
  { path: "requests/:id", element: <RequestPage /> },
  { path: "requests/:id/change", element: <ChangeOrCancelPage /> },
  { path: "balance", element: <BalancePage /> },
  { path: "calendar", element: <MeCalendarPage /> },
];
