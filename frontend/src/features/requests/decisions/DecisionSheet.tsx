import { useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FormSummary, TaskSheet, TextAreaField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { isConflict, useDecideStep } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { useRequestsText } from "../platform";
import { byName, details, serverProblems } from "../problems";
import { describeQuantity, describeWhen, joined } from "../text";
import type { Decision, RequestDetail, RequestOut } from "../types";

export interface DecisionTarget {
  request: RequestOut;
  stepId: number;
  decision: Decision;
}

interface DecisionSheetProps {
  /** The decision being taken; the sheet is open while this is not null. */
  target: DecisionTarget | null;
  onClose: () => void;
  onDone?: (request: RequestDetail) => void;
}

interface Values {
  comment: string;
}

const COMMENT_CODES = { "request.comment_required": "comment", "request.reason_required": "comment" } as const;

/**
 * Whether "Send back" may be offered for the step this viewer can decide. The step belongs to a
 * change exactly when the request is approved and its change is waiting; a change is approved or
 * refused, never sent back.
 */
export function canSendBack(request: RequestOut): boolean {
  return !(request.status === "approved" && request.amendment?.status === "pending");
}

/** Approve, refuse or send back one step, as a focused task with its consequence stated (U6). */
export function DecisionSheet({ target, onClose, onDone }: DecisionSheetProps) {
  // Keep the last target so the sheet can close with its content still in place.
  const [last, setLast] = useState(target);
  if (target !== null && target !== last) setLast(target);
  if (last === null) return null;
  return (
    <DecisionBody
      key={`${last.stepId}:${last.decision}`}
      open={target !== null}
      target={last}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

interface DecisionBodyProps {
  open: boolean;
  target: DecisionTarget;
  onClose: () => void;
  onDone?: (request: RequestDetail) => void;
}

function DecisionBody({ open, target, onClose, onDone }: DecisionBodyProps) {
  const { t, lang } = useRequestsText();
  const decide = useDecideStep();
  const { request, stepId, decision } = target;
  const name = request.employee.name;
  const form = useForm<Values>({ defaultValues: { comment: "" } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const [confirm, confirming] = useSingleFlight(async (values: Values) => {
    const comment = values.comment.trim();
    if (decision !== "approve" && comment === "") {
      form.setError("comment", { type: "client", message: t(`decision.required.${decision}`) }, { shouldFocus: true });
      return;
    }
    try {
      const updated = await decide.mutateAsync({ stepId, body: { decision, comment, version: request.version } });
      toast(t(`decision.done.${decision}`, { name }));
      onDone?.(updated);
      onClose();
    } catch (error) {
      if (isConflict(error)) {
        // Someone else acted first: say so, close, and let the refreshed lists show the current state.
        toast(t("common:concurrent"));
        onClose();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(["comment"], COMMENT_CODES)));
    }
  });

  const consequence = decision === "approve" && request.viewer.relation === "hr" ? "approveHr" : decision;

  return (
    <TaskSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(`decision.title.${decision}`)}
      footer={
        <>
          <Button
            type="button"
            variant={decision === "reject" ? "destructive" : "primary"}
            aria-busy={confirming}
            onClick={form.handleSubmit(confirm)}
          >
            {t(`decision.confirm.${decision}`)}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(confirm)} className="flex flex-col gap-4">
        <div>
          <p className="text-body font-semibold">{name}</p>
          <p className="text-body text-text-secondary">
            {joined(request.type.name, describeWhen(request, t, lang), describeQuantity(request, lang))}
          </p>
        </div>
        <p className="text-body">{t(`decision.consequence.${consequence}`, { name })}</p>
        <FormSummary problems={details(loose)} />
        <TextAreaField control={form.control} name="comment" label={t(`decision.comment.${decision}`)} />
      </form>
    </TaskSheet>
  );
}
