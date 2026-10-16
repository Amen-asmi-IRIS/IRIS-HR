import { useTranslation } from "react-i18next";
import { problemText } from "@/api/problemText";
import type { AccountDetail } from "@/api/types";
import { TaskSheet } from "@/components/TaskSheet";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAddRole, useRemoveRole } from "./api";
import { ASSIGNABLE_ROLES, type AssignableRole } from "./createAccountForm";

/** One account cannot hold both (PRD 3). */
const EXCLUDES: Partial<Record<AssignableRole, AssignableRole>> = { hr: "sysadmin", sysadmin: "hr" };

interface RolesSheetProps {
  account: AccountDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Add or remove the roles a System Administrator gives. A role that cannot be added is explained, not greyed out. */
export function RolesSheet({ account, open, onOpenChange }: RolesSheetProps) {
  const { t } = useTranslation();
  const add = useAddRole(account.public_id);
  const remove = useRemoveRole(account.public_id);
  const held = account.roles as readonly string[];
  const refused = (error: unknown) => toast(problemText(error, t));

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts:account.rolesTitle", { name: account.name })}
      description={t("accounts:account.rolesIntro")}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {t("actions.done")}
        </Button>
      }
    >
      <ul className="flex flex-col">
        {ASSIGNABLE_ROLES.map((role) => {
          const name = t(`roles.${role}`);
          const other = EXCLUDES[role];
          const has = held.includes(role);
          const excluded = !has && other !== undefined && held.includes(other);
          return (
            <li key={role} className="flex min-h-15 items-center justify-between gap-4 border-b border-divider py-2">
              <div>
                <p className="text-body font-medium text-foreground">{name}</p>
                {excluded && other && <p className="text-caption text-muted-foreground">{t("accounts:account.incompatible", { role: name, other: t(`roles.${other}`) })}</p>}
              </div>
              {has && (
                <Button
                  size="sm"
                  aria-label={t("accounts:account.removeRole", { role: name })}
                  onClick={() => remove.mutate(role, { onSuccess: () => toast(t("accounts:account.roleRemoved")), onError: refused })}
                >
                  {t("actions.remove")}
                </Button>
              )}
              {!has && !excluded && (
                <Button
                  size="sm"
                  aria-label={t("accounts:account.addRole", { role: name })}
                  onClick={() => add.mutate(role, { onSuccess: () => toast(t("accounts:account.roleAdded")), onError: refused })}
                >
                  {t("actions.add")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </TaskSheet>
  );
}
