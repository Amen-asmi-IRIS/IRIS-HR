import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { matchPath, NavLink, useLocation } from "react-router";
import { visibleNav } from "@/app/navigation";
import { WORKSPACES, type NavEntry, type WorkspaceId } from "@/app/workspaces";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface NavListProps {
  workspace: WorkspaceId;
  /** A column in the desktop sidebar, or the tab bar at the bottom of a phone. */
  variant: "sidebar" | "tabs";
}

/** The phone tab bar shows at most this many tabs: past it, the fourth is followed by "More". */
const MAX_TABS = 5;

const tab = (current: boolean) =>
  cn(
    "flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-caption font-medium",
    current ? "text-primary" : "text-muted-foreground",
  );

/** The entries that do not fit on the tab bar, listed with their full labels above it. */
function MoreTab({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // The page belongs to one of these entries: the person sees where they are.
  const current = entries.some((entry) => matchPath({ path: entry.path, end: false }, pathname) !== null);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button type="button" aria-current={current ? "true" : undefined} className={tab(current)}>
          <Ellipsis aria-hidden="true" className="size-5" />
          <span className="max-w-full truncate px-1">{t("shell:more")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("shell:more")} side="top" align="end" collisionPadding={16}>
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <li key={entry.path}>
              <NavLink
                to={entry.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-body font-medium hover:bg-accent",
                    isActive ? "text-primary" : "text-foreground",
                  )
                }
              >
                <entry.icon aria-hidden="true" className="size-4 shrink-0" />
                {t(entry.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** The entries of the current workspace only (UI 3.3). */
export function NavList({ workspace, variant }: NavListProps) {
  const { t } = useTranslation();
  const entries = visibleNav(workspace);
  const home = WORKSPACES[workspace].home;

  if (variant === "tabs") {
    const overflow = entries.length > MAX_TABS;
    const shown = overflow ? entries.slice(0, MAX_TABS - 1) : entries;
    return (
      <nav aria-label={t("shell:navigation")} className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-card">
        {shown.map((entry) => (
          <NavLink key={entry.path} to={entry.path} end={entry.path === home} className={({ isActive }) => tab(isActive)}>
            <entry.icon aria-hidden="true" className="size-5" />
            <span className="max-w-full truncate px-1">{t(entry.shortLabelKey ?? entry.labelKey)}</span>
          </NavLink>
        ))}
        {overflow && <MoreTab entries={entries.slice(MAX_TABS - 1)} />}
      </nav>
    );
  }

  return (
    <nav aria-label={t("shell:navigation")} className="flex flex-col gap-1">
      {entries.map((entry) => (
        <NavLink
          key={entry.path}
          to={entry.path}
          end={entry.path === home}
          className={({ isActive }) =>
            cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-[120ms] ease-standard",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted",
            )
          }
        >
          <entry.icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{t(entry.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
