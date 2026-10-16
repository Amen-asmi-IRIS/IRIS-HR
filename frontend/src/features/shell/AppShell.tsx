import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router";
import { availableWorkspaces, workspaceOfPath } from "@/app/navigation";
import { WORKSPACES } from "@/app/workspaces";
import logo from "@/assets/iris-logo.png";
import { PageLoading } from "@/components/PageLoading";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { useIsPhone } from "@/components/useIsPhone";
import { AfterSignInNotice } from "@/features/auth/AfterSignInNotice";
import { useCurrentUser, useUpdateMe } from "@/features/auth/api";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";
import { cn } from "@/lib/utils";
import { EnvironmentStrip } from "./EnvironmentStrip";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavList } from "./NavList";
import { useCurrentWorkspace } from "./useCurrentWorkspace";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const skipClass =
  "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-body focus:font-semibold focus:text-primary";

/** The frame of every signed-in page: one layout per viewport, never both (master 9.1). */
export default function AppShell() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const phone = useIsPhone();
  const { pathname } = useLocation();
  const workspace = useCurrentWorkspace();
  const { mutate: remember } = useUpdateMe();
  const several = availableWorkspaces(me).length > 1;
  const inUse = workspaceOfPath(pathname);

  useEffect(() => {
    // "After sign-in the user lands on the workspace they used last" (UI 3.2).
    if (inUse !== null && inUse === workspace && me.last_workspace !== inUse) remember({ last_workspace: inUse });
  }, [inUse, workspace, me.last_workspace, remember]);

  const page = (
    <ProblemBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </ProblemBoundary>
  );

  // The page has the same place in both layouts. Otherwise turning a phone on its side, which changes the layout,
  // would draw the page anew: an open sheet would close and a form would lose what was typed in it.
  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className={skipClass}>
        {t("skipToContent")}
      </a>
      <EnvironmentStrip environment={me.environment} />
      {phone && (
        <header className="sticky top-0 z-30 flex h-15 items-center gap-2 border-b border-border bg-card px-4">
          <div className="min-w-0 flex-1">
            {several ? (
              <WorkspaceSwitcher current={workspace} />
            ) : (
              <p className="truncate text-section font-semibold text-foreground">{workspace ? t(WORKSPACES[workspace].labelKey) : t("appName")}</p>
            )}
          </div>
          <NotificationsBell compact />
          <UserMenu compact withLanguage />
        </header>
      )}
      <div className={phone ? undefined : "mx-auto flex max-w-[1440px]"}>
        {!phone && (
          <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4">
            <img src={logo} alt={t("appName")} className="h-8 w-auto self-start" />
            <WorkspaceSwitcher current={workspace} />
            <div className="min-h-0 flex-1 overflow-y-auto">{workspace && <NavList workspace={workspace} variant="sidebar" />}</div>
            <div className="flex flex-col gap-2 border-t border-sidebar-border pt-3">
              <NotificationsBell />
              <LanguageSwitch />
              <UserMenu />
            </div>
          </aside>
        )}
        {/* Focusable, so that the skip link and a closed sheet whose button is gone can move the focus here. */}
        <main
          id="main"
          tabIndex={-1}
          className={cn("outline-none focus-visible:shadow-none", phone ? "px-4 pb-24 pt-4" : "min-w-0 flex-1 px-[clamp(16px,3vw,40px)] py-8")}
        >
          <AfterSignInNotice />
          {page}
        </main>
      </div>
      {phone && workspace && <NavList workspace={workspace} variant="tabs" />}
    </div>
  );
}
