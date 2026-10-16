import { useId, type ReactNode } from "react";
import { TaskSheet } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequestsText } from "../../platform";
import { describeQuantity, describeWhen, joined } from "../../text";
import type { RequestOut, StateKey } from "../../types";

/**
 * The step that is open now: that of a waiting change to an approved request, else the request's
 * own. It says whom the step waits for and whether it is a manager's.
 */
export function openStep(request: RequestOut): { key: StateKey; waitingOn: string[] } {
  const change = request.status === "approved" && request.amendment?.status === "pending" ? request.amendment : null;
  return change
    ? { key: change.state_key, waitingOn: change.waiting_on }
    : { key: request.state.key, waitingOn: request.state.waiting_on };
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  destructive?: boolean;
  /** The form of the task. It carries `id={formId}` so that the button of the footer submits it. */
  children: (formId: string) => ReactNode;
}

/**
 * A focused HR task: plan 01b's sheet with one confirming button and Cancel. The form is mounted
 * only while the sheet is open, so every opening starts from a fresh form.
 */
export function ActionSheet({ open, onOpenChange, title, submitLabel, destructive = false, children }: ActionSheetProps) {
  const { t } = useRequestsText();
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button type="submit" form={formId} variant={destructive ? "destructive" : "primary"}>
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      {open ? children(formId) : null}
    </TaskSheet>
  );
}

/** Who and what the task is about, at the top of a sheet. */
export function RequestLine({ request }: { request: RequestOut }) {
  const { t, lang } = useRequestsText();
  return (
    <div>
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body text-text-secondary">
        {joined(request.type.name, describeWhen(request, t, lang), describeQuantity(request, lang))}
      </p>
    </div>
  );
}
