import { useLocation } from "react-router";
import { availableWorkspaces, landingWorkspace, workspaceOfPath } from "@/app/navigation";
import type { WorkspaceId } from "@/app/workspaces";
import { useCurrentUser } from "@/features/auth/api";

/** The workspace of the address; on a page that belongs to none (notifications, password), the landing workspace. */
export function useCurrentWorkspace(): WorkspaceId | null {
  const me = useCurrentUser();
  const { pathname } = useLocation();
  const fromPath = workspaceOfPath(pathname);
  if (fromPath && availableWorkspaces(me).includes(fromPath)) return fromPath;
  return landingWorkspace(me);
}
