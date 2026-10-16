import { lazy } from "react";
import type { RouteObject } from "react-router";

const ChangePasswordPage = lazy(() => import("@/features/auth/ChangePasswordPage"));
const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage"));
const RequestRedirect = lazy(() => import("@/features/requests/RequestRedirect"));

// Pages inside the shell that belong to no workspace, with absolute paths.
// A plan adds a page by appending an element to this array.
export const sharedRoutes: RouteObject[] = [
  { path: "/password", element: <ChangePasswordPage /> },
  { path: "/notifications", element: <NotificationsPage /> },
  { path: "/requests/:id", element: <RequestRedirect /> },
];
