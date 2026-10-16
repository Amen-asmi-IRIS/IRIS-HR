import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { NotAvailable } from "@/components/NotAvailable";
import { useCurrentUser } from "@/features/auth/api";
import ChooseNewPasswordPage from "@/features/auth/ChooseNewPasswordPage";
import SignInPage from "@/features/auth/SignInPage";
import AppShell from "@/features/shell/AppShell";
import NoWorkspacePage from "@/features/shell/NoWorkspacePage";
import { RequireAuth, RequirePasswordChange, RequireWorkspace } from "./guards";
import { HOMES } from "./homes";
import { landingWorkspace, visibleNav, WORKSPACE_ROUTES } from "./navigation";
import { sharedRoutes } from "./sharedRoutes";
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from "./workspaces";

/** The root address: the workspace used last, or the most specific one (UI 3.2). */
function Landing() {
  const me = useCurrentUser();
  const workspace = landingWorkspace(me);
  return workspace ? <Navigate to={WORKSPACES[workspace].home} replace /> : <NoWorkspacePage />;
}

/** The home of a workspace, or its first page while it has no home yet. */
function WorkspaceIndex({ id }: { id: WorkspaceId }) {
  const Home = HOMES[id];
  if (Home) return <Home />;
  const first = visibleNav(id)[0];
  return first ? <Navigate to={first.path} replace /> : <NotAvailable />;
}

export const routes: RouteObject[] = [
  { path: "/login", element: <SignInPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/password/new", element: <ChooseNewPasswordPage /> },
      {
        element: <RequirePasswordChange />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/", element: <Landing /> },
              ...sharedRoutes,
              ...WORKSPACE_IDS.map(
                (id): RouteObject => ({
                  path: `/${id}`,
                  element: <RequireWorkspace id={id} />,
                  children: [{ index: true, element: <WorkspaceIndex id={id} /> }, ...WORKSPACE_ROUTES[id]],
                }),
              ),
              { path: "*", element: <NotAvailable /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
