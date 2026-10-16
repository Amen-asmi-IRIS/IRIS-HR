import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { backToList, Disclosure, FormSummary, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { AddFileSheet } from "../AddFileSheet";
import { isConflict, useSubmitRequest } from "../api";
import { DecisionContextView } from "../decisions/DecisionContext";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { DocumentStatus } from "../DocumentStatus";
import { useSingleFlight } from "../form/useSingleFlight";
import { openStep } from "../hr/actions/ActionSheet";
import { CorrectSheet } from "../hr/actions/CorrectSheet";
import { ManagerDelegateSheet } from "../hr/actions/ManagerDelegateSheet";
import { ReassignSheet } from "../hr/actions/ReassignSheet";
import { ReclassifySheet } from "../hr/actions/ReclassifySheet";
import { RecordOnBehalfSheet } from "../hr/actions/RecordOnBehalfSheet";
import { useRequestsText } from "../platform";
import { details } from "../problems";
import { RequestView } from "../RequestView";
import type { Decision, RequestAction, RequestDetail, StepOut } from "../types";
import { useUndoable } from "../undoable";
import { FileList, stepOutcome, stepWho } from "./parts";

type Task = "record" | "reassign" | "delegate" | "correct" | "reclassify" | "attach";

const DECIDED: ReadonlySet<StepOut["status"]> = new Set(["approved", "rejected", "returned"]);

/**
 * The latest decision someone other than HR took, for HR to read before its own. A step that only informed, or was
 * skipped, carries a time too, but no decision.
 */
function earlierDecision(steps: StepOut[]): StepOut | null {
  const decided = steps.filter((step) => step.rule !== "hr_role" && DECIDED.has(step.status) && step.decided_at !== null);
  decided.sort((a, b) => Date.parse(b.decided_at ?? "") - Date.parse(a.decided_at ?? ""));
  return decided[0] ?? null;
}

/** A request seen by HR (UI 7.8): everything, the decision, and the corrective actions one step away. */
export default function RequestHrView({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const { discard } = useUndoable();
  const submit = useSubmitRequest();
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [problems, setProblems] = useState<FieldProblem[]>([]);

  const id = request.public_id;
  const name = request.employee.name;
  const stepId = request.viewer.step_id;
  const can = (action: RequestAction) => request.viewer.actions.includes(action);
  const canDecide = can("decide") && stepId !== null;
  const canCorrect = can("correct") || can("cancel");
  const earlier = earlierDecision(request.steps);
  const documentStatus = request.certificate?.status;
  const attachLabel =
    documentStatus === "due" || documentStatus === "overdue"
      ? t("form.certificate")
      : documentStatus === "missing"
        ? t("form.proof")
        : t("addFile.label");

  const ask = (decision: Decision) => {
    if (stepId !== null) setTarget({ request, stepId, decision });
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

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

  const others: { task: Task; label: string }[] = [];
  if (can("record_on_behalf") && stepId !== null) others.push({ task: "record", label: t("hrView.actions.record") });
  if (can("reassign") && stepId !== null) {
    others.push({ task: "reassign", label: t("hrView.actions.reassign") });
    // A delegate is named for a manager; a named person's step is given to someone else instead.
    if (openStep(request).key === "waiting_manager") others.push({ task: "delegate", label: t("hrView.actions.delegate") });
  }
  if (canCorrect) others.push({ task: "correct", label: t("hrView.actions.correct") });
  if (can("reclassify")) others.push({ task: "reclassify", label: t("hrView.actions.reclassify") });
  if (can("attach")) others.push({ task: "attach", label: t("hrView.actions.attach") });

  const hasActions = canDecide || can("submit") || can("edit") || can("discard");
  const actions = (
    <>
      {can("submit") && (
        <Button variant="primary" aria-busy={sending} onClick={() => void send()}>
          {t("common.send")}
        </Button>
      )}
      {canDecide && (
        <>
          <Button variant="primary" onClick={() => ask("approve")}>
            {t("decision.confirm.approve")}
          </Button>
          <Button variant="secondary" onClick={() => ask("reject")}>
            {t("decision.confirm.reject")}
          </Button>
          {canSendBack(request) && (
            <Button variant="secondary" onClick={() => ask("return")}>
              {t("decision.confirm.return")}
            </Button>
          )}
        </>
      )}
      {can("edit") && (
        <Button asChild variant="secondary">
          <Link to={`/hr/requests/${id}/edit`}>{t(request.status === "returned" ? "mine.editAndResend" : "common.edit")}</Link>
        </Button>
      )}
      {can("discard") && (
        <Button
          variant="ghost"
          onClick={() => {
            discard(request);
            navigate("/hr/requests");
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
        back={backToList("/hr/requests")}
        commentFirst
        filesFirst
        context={
          <>
            <FormSummary problems={details(problems)} />
            <div className="mt-3 flex flex-col items-start gap-2">
              <h2 className="text-caption font-medium text-muted-foreground">{t("hrView.document")}</h2>
              <DocumentStatus request={request} />
              {request.attachments.length > 0 && <FileList attachments={request.attachments} />}
            </div>
            {earlier && (
              <div className="mt-3">
                <h2 className="text-caption font-medium text-muted-foreground">{stepWho(earlier, t)}</h2>
                <p className="text-body">{stepOutcome(earlier, t, lang)}</p>
                {earlier.comment && <p className="text-body text-text-secondary">{t("steps.quoted", { text: earlier.comment })}</p>}
              </div>
            )}
            <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
          </>
        }
        actions={hasActions ? actions : undefined}
        extra={
          others.length > 0 ? (
            <Disclosure title={t("hrView.otherActions")}>
              <div className="flex flex-wrap gap-2">
                {others.map((other) => (
                  <Button key={other.task} variant="secondary" onClick={() => setTask(other.task)}>
                    {other.label}
                  </Button>
                ))}
              </div>
            </Disclosure>
          ) : undefined
        }
      />

      <DecisionSheet target={target} onClose={() => setTarget(null)} />
      {stepId !== null && can("record_on_behalf") && (
        <RecordOnBehalfSheet open={task === "record"} onOpenChange={close} request={request} stepId={stepId} />
      )}
      {stepId !== null && can("reassign") && (
        <>
          <ReassignSheet open={task === "reassign"} onOpenChange={close} request={request} stepId={stepId} />
          <ManagerDelegateSheet open={task === "delegate"} onOpenChange={close} employeeId={request.employee.public_id} />
        </>
      )}
      {canCorrect && <CorrectSheet open={task === "correct"} onOpenChange={close} request={request} />}
      {can("reclassify") && <ReclassifySheet open={task === "reclassify"} onOpenChange={close} request={request} />}
      {can("attach") && (
        <AddFileSheet
          open={task === "attach"}
          onOpenChange={close}
          requestId={id}
          title={t("hrView.attachTitle", { name })}
          label={attachLabel}
        />
      )}
    </>
  );
}
