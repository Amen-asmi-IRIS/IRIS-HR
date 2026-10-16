import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { availableWorkspaces } from "@/app/navigation";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/features/auth/api";
import { useWorkspaceCounts } from "./workspaceCounts";

const countClass = "tabular rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-info";

/** Appears only for a person with more than one workspace, and says how much waits in each (UI 3.2). */
export function WorkspaceSwitcher({ current }: { current: WorkspaceId | null }) {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const available = availableWorkspaces(me);
  // Without a switcher there is nothing to count: a person with one workspace does not read the summary.
  const counts = useWorkspaceCounts(available.length > 1);
  if (available.length < 2) return null;

  const currentName = current ? t(WORKSPACES[current].labelKey) : t("shell:workspace.switch");
  const elsewhere = available.filter((id) => id !== current).reduce((sum, id) => sum + (counts[id] ?? 0), 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="w-full justify-between rounded-lg"
          aria-label={elsewhere > 0 ? t("shell:workspace.currentWaiting", { name: currentName, total: elsewhere }) : t("shell:workspace.current", { name: currentName })}
        >
          <span className="truncate">{currentName}</span>
          <span className="flex items-center gap-2">
            {elsewhere > 0 && (
              <span aria-hidden="true" className={countClass}>
                {elsewhere}
              </span>
            )}
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("shell:workspace.switch")}</DropdownMenuLabel>
        {available.map((id) => {
          const name = t(WORKSPACES[id].labelKey);
          const waiting = counts[id] ?? 0;
          return (
            <DropdownMenuItem key={id} aria-label={waiting > 0 ? t("shell:workspace.waiting", { name, total: waiting }) : name} onSelect={() => navigate(WORKSPACES[id].home)}>
              <span className="flex items-center gap-2">
                {name}
                {id === current && <Check aria-hidden="true" className="text-primary" />}
              </span>
              {waiting > 0 && (
                <span aria-hidden="true" className={countClass}>
                  {waiting}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
