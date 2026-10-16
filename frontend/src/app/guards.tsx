import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ProblemError } from "@/api/problem";
import { BeingUpdated } from "@/components/BeingUpdated";
import { NotAvailable } from "@/components/NotAvailable";
import { PageLoading } from "@/components/PageLoading";
import { SomethingWentWrong } from "@/components/SomethingWentWrong";
import { useCurrentUser, useMe } from "@/features/auth/api";
import { wasSignedOut } from "@/features/auth/session";
import { isLang, setLanguage } from "@/i18n";
import { availableWorkspaces } from "./navigation";
import type { WorkspaceId } from "./workspaces";

/** The address to return to after sign-in, or null when it would leave the application or loop. */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  // A browser reads a backslash as a slash and drops tabs and line breaks, so "/\evil" and "/<tab>/evil" leave the site.
  for (const character of next) {
    const code = character.charCodeAt(0);
    if (character === "\\" || code < 32 || code === 127) return null;
  }
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return null;
  return next;
}

/** Sign in, carrying the page the visitor was on, unless they signed out themselves. */
export function signInPath(location: { pathname: string; search: string }): string {
  const here = location.pathname + location.search;
  if (here === "/" || wasSignedOut()) return "/login";
  return `/login?next=${encodeURIComponent(here)}`;
}

/** Everything below needs a session. Also covers the application being away. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  const languageApplied = useRef(false);
  const user = me.data;

  useEffect(() => {
    // On a page load the language stored on the account wins over the browser's.
    if (user && !languageApplied.current) {
      languageApplied.current = true;
      if (isLang(user.language)) void setLanguage(user.language);
    }
  }, [user]);

  if (me.isPending) {
    return (
      <div className="p-6">
        <PageLoading />
      </div>
    );
  }
  if (user === undefined) {
    const error = me.error;
    if (error instanceof ProblemError && error.unavailable) return <BeingUpdated onRetry={() => void me.refetch()} />;
    return (
      <div className="p-6">
        <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />
      </div>
    );
  }
  if (user === null) return <Navigate to={signInPath(location)} replace />;
  return <Outlet />;
}

/** A user who signed in with a temporary password reaches nothing else until it is replaced. */
export function RequirePasswordChange() {
  const me = useCurrentUser();
  if (me.must_change_password) return <Navigate to="/password/new" replace />;
  return <Outlet />;
}

/** A workspace opens to the roles that have it; to anyone else it is "not available". */
export function RequireWorkspace({ id }: { id: WorkspaceId }) {
  const me = useCurrentUser();
  if (!availableWorkspaces(me).includes(id)) return <NotAvailable />;
  return <Outlet />;
}
