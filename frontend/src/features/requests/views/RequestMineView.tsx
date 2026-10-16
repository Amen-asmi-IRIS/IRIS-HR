import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { backToList, FormSummary, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays } from "@/lib/format";
import { AddFileSheet } from "../AddFileSheet";
import { DelegationOffer } from "../DelegationOffer";
import { isConflict, useSubmitRequest, useWithdrawAmendment } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { useRequestsText } from "../platform";
import { details } from "../problems";
import { RequestView } from "../RequestView";
import type { RequestAction, RequestDetail } from "../types";
import { useUndoable } from "../undoable";

/** A request seen by the person who made it (UI 5.4). Every control comes from `viewer.actions`. */
export default function RequestMineView({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const { withdraw, discard } = useUndoable();
  const submit = useSubmitRequest();
  const withdrawAmendment = useWithdrawAmendment();
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [addingFile, setAddingFile] = useState(false);

  const id = request.public_id;
  const can = (action: RequestAction) => request.viewer.actions.includes(action);
  // The owner is shown the balance when the API gives it; who else is away is not theirs to see (UI 10.2).
  const balance = request.decision_context?.balance ?? null;
  const documentStatus = request.certificate?.status;
  const documentWaiting = documentStatus === "due" || documentStatus === "overdue" || documentStatus === "missing";
  const attachTitle =
    documentStatus === "missing" ? t("mine.addProof") : documentWaiting ? t("mine.addCertificate") : t("mine.addFile");
  const attachLabel =
    documentStatus === "missing" ? t("form.proof") : documentWaiting ? t("form.certificate") : t("addFile.label");

  const primary = can("submit") && request.status === "draft"
    ? "submit"
    : can("edit") && request.status === "returned"
      ? "resend"
      : can("attach") && documentWaiting
        ? "attach"
        : null;

  const [send, sending] = useSingleFlight(async () => {
    try {
      await submit.mutateAsync({ id, version: request.version });
      setProblems([]);
      toast(t("form.sent"));
    } catch (error) {
      if (error instanceof ProblemError && error.status !== 409) setProblems(error.errors);
      else {
        const detail = t(isConflict(error) ? "common:concurrent" : "errors:unexpected");
        setProblems([{ field: null, code: "core.unexpected", detail, params: {} }]);
      }
    }
  });

  const [withdrawChange, withdrawingChange] = useSingleFlight(async () => {
    if (!request.amendment) return;
    try {
      await withdrawAmendment.mutateAsync(request.amendment.public_id);
      toast(t("mine.changeWithdrawn"));
    } catch (error) {
      toast(t(isConflict(error) ? "common:concurrent" : "errors:unexpected"));
    }
  });

  const actions = (
    <>
      {primary === "submit" && (
        <Button variant="primary" aria-busy={sending} onClick={() => void send()}>
          {t("common.send")}
        </Button>
      )}
      {primary === "resend" && (
        <Button asChild variant="primary">
          <Link to={`/me/requests/${id}/edit`}>{t("mine.editAndResend")}</Link>
        </Button>
      )}
      {primary === "attach" && (
        <Button variant="primary" onClick={() => setAddingFile(true)}>
          {attachTitle}
        </Button>
      )}
      {can("edit") && primary !== "resend" && (
        <Button asChild variant="secondary">
          <Link to={`/me/requests/${id}/edit`}>{t("common.edit")}</Link>
        </Button>
      )}
      {can("amend") && (
        <>
          <Button asChild variant="secondary">
            <Link to={`/me/requests/${id}/change?kind=change`}>{t("mine.changeDates")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/me/requests/${id}/change?kind=cancel`}>{t("mine.cancelRequest")}</Link>
          </Button>
        </>
      )}
      {can("attach") && primary !== "attach" && (
        <Button variant="secondary" onClick={() => setAddingFile(true)}>
          {attachTitle}
        </Button>
      )}
      {can("withdraw_amendment") && request.amendment && (
        <Button variant="secondary" aria-busy={withdrawingChange} onClick={() => void withdrawChange()}>
          {t("mine.withdrawChange")}
        </Button>
      )}
      {can("withdraw") && (
        <Button
          variant="ghost"
          onClick={() => {
            withdraw(request);
            navigate("/me/requests");
          }}
        >
          {t("common.withdraw")}
        </Button>
      )}
      {can("discard") && (
        <Button
          variant="ghost"
          onClick={() => {
            discard(request);
            navigate("/me/requests");
          }}
        >
          {t("common.discard")}
        </Button>
      )}
    </>
  );

  return (
    <>
      <RequestView
        request={request}
        back={backToList("/me/requests")}
        context={
          <>
            <FormSummary problems={details(problems)} />
            {balance && (
              <p className="mt-3 text-body text-text-secondary">
                {t("mine.balance", { now: formatDays(balance.now, lang), after: formatDays(balance.after, lang) })}
              </p>
            )}
            <DelegationOffer request={request} />
          </>
        }
        actions={request.viewer.actions.length > 0 ? actions : undefined}
      />
      {can("attach") && (
        <AddFileSheet open={addingFile} onOpenChange={setAddingFile} requestId={id} title={attachTitle} label={attachLabel} />
      )}
    </>
  );
}
