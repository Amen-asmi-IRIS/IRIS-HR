import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useResolvedPath } from "react-router";
import { problemText } from "@/api/problemText";
import type { TemporaryPassword as TemporaryPasswordAnswer } from "@/api/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Disclosure } from "@/components/Disclosure";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { TaskSheet } from "@/components/TaskSheet";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { backToList } from "@/components/useListParams";
import { actionLabel } from "@/features/audit/labels";
import { useCurrentUser } from "@/features/auth/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { AccountState } from "./AccountState";
import { useAccount, useAccountAction, useResetPassword } from "./api";
import { RolesSheet } from "./RolesSheet";
import { TemporaryPassword } from "./TemporaryPassword";

const termClass = "text-muted-foreground";
const valueClass = "m-0 text-foreground";

/** One account: its state first, the history one step away, and the actions that apply to it now (UI 9.4). */
export default function AccountPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const { id = "" } = useParams();
  const me = useCurrentUser();
  const listPath = useResolvedPath("..", { relative: "path" }).pathname;
  const account = useAccount(id);
  const reset = useResetPassword(id);
  const act = useAccountAction(id);
  // The only place the temporary password is kept. Closing the sheet drops it.
  const [temporary, setTemporary] = useState<TemporaryPasswordAnswer | null>(null);
  const forgetTemporary = () => {
    setTemporary(null);
    // The answer of the call carried the password too: it is dropped with it.
    reset.reset();
  };
  const [rolesOpen, setRolesOpen] = useState(false);

  if (account.isPending) return <PageLoading />;
  if (account.error) throw account.error;

  const data = account.data;
  // The API refuses an administrator who acts on their own account, so the actions are not shown there.
  const canAct = !readOnly && data.public_id !== me.public_id;
  // The account of someone who has left is never enabled again (the API refuses it): the action is replaced by the reason.
  const leftForGood = data.state === "disabled" && !data.can_enable;
  const refused = (error: unknown) => toast(problemText(error, t));
  const when = (value: string | null) => (value ? formatDateTime(value, lang) : t("state.never"));

  return (
    <>
      <PageHeader
        title={data.name}
        back={backToList(listPath)}
        primary={
          canAct ? (
            <ConfirmDialog
              trigger={<Button variant="primary">{t("accounts:account.reset")}</Button>}
              title={t("accounts:account.resetTitle")}
              consequence={t("accounts:account.resetConsequence")}
              confirmLabel={t("accounts:account.reset")}
              onConfirm={() => reset.mutate(undefined, { onSuccess: setTemporary, onError: refused })}
            />
          ) : undefined
        }
      >
        {data.email}
      </PageHeader>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 text-body">
        <dt className={termClass}>{t("accounts:account.state")}</dt>
        <dd className={valueClass}>
          <AccountState state={data.state} />
        </dd>
        <dt className={termClass}>{t("accounts:account.roles")}</dt>
        <dd className={valueClass}>{data.roles.length > 0 ? data.roles.map((role) => t(`roles.${role}`)).join(", ") : t("accounts:list.noRole")}</dd>
        <dt className={termClass}>{t("accounts:account.lastSignIn")}</dt>
        <dd className={valueClass}>{when(data.last_login_at)}</dd>
      </dl>

      {canAct && leftForGood && <p className="mt-6 max-w-xl text-body text-muted-foreground">{t("accounts:account.employeeLeft")}</p>}
      {canAct && (
        <div className="mt-6 flex flex-wrap gap-3">
          {data.state === "locked" && (
            <Button onClick={() => act.mutate("unlock", { onSuccess: () => toast(t("accounts:account.unlocked")), onError: refused })}>{t("accounts:account.unlock")}</Button>
          )}
          {data.state === "disabled" ? (
            !leftForGood && <Button onClick={() => act.mutate("enable", { onSuccess: () => toast(t("accounts:account.enabled")), onError: refused })}>{t("accounts:account.enable")}</Button>
          ) : (
            <ConfirmDialog
              destructive
              trigger={<Button>{t("accounts:account.disable")}</Button>}
              title={t("accounts:account.disableTitle")}
              consequence={t("accounts:account.disableConsequence")}
              confirmLabel={t("accounts:account.disableConfirm")}
              onConfirm={() => act.mutate("disable", { onSuccess: () => toast(t("accounts:account.disabled")), onError: refused })}
            />
          )}
          <Button onClick={() => setRolesOpen(true)}>{t("accounts:account.manageRoles")}</Button>
        </div>
      )}

      <div className="mt-8 max-w-xl">
        <Disclosure title={t("accounts:account.details")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-body">
            <dt className={termClass}>{t("accounts:account.previousSignIn")}</dt>
            <dd className={valueClass}>{when(data.previous_login_at)}</dd>
            <dt className={termClass}>{t("accounts:account.failedAttempts")}</dt>
            <dd className={`${valueClass} tabular`}>{data.failed_attempts}</dd>
            {data.locked_until && (
              <>
                <dt className={termClass}>{t("accounts:account.lockedUntil")}</dt>
                <dd className={valueClass}>{formatDateTime(data.locked_until, lang)}</dd>
              </>
            )}
            <dt className={termClass}>{t("accounts:account.created")}</dt>
            <dd className={valueClass}>
              {t("accounts:account.createdBy", { when: formatDateTime(data.created_at, lang), by: data.created_by ?? t("accounts:account.assignedBySystem") })}
            </dd>
          </dl>
          {data.role_assignments.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-body text-foreground">
              {data.role_assignments.map((assignment) => (
                <li key={assignment.role}>
                  {t("accounts:account.assigned", {
                    role: t(`roles.${assignment.role}`),
                    by: assignment.assigned_by ?? t("accounts:account.assignedBySystem"),
                    when: formatDateTime(assignment.assigned_at, lang),
                  })}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-6 text-section font-semibold text-foreground">{t("accounts:account.events")}</h3>
          {data.recent_events.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("accounts:account.noEvents")}</p>
          ) : (
            <ul aria-label={t("accounts:account.events")} className="flex flex-col text-body">
              {data.recent_events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-divider py-2">
                  <span className="text-foreground">{actionLabel(event.action, t, i18n)}</span>
                  <span className="text-caption text-muted-foreground">{formatDateTime(event.at, lang)}</span>
                  <span className="tabular w-full text-caption text-muted-foreground">{event.ip_address ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </div>

      <TaskSheet
        open={temporary !== null}
        onOpenChange={(open) => {
          if (!open) forgetTemporary();
        }}
        title={t("accounts:temporary.title")}
      >
        {temporary && <TemporaryPassword title={data.name} password={temporary.temporary_password} expiresAt={temporary.expires_at} onDone={forgetTemporary} />}
      </TaskSheet>
      <RolesSheet account={data} open={rolesOpen} onOpenChange={setRolesOpen} />
    </>
  );
}
