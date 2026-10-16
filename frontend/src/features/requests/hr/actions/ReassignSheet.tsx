import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FormSummary, TextAreaField, toast } from "@/components";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { isConflict, useReassignStep } from "../../api";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import type { RequestOut } from "../../types";
import { ActionSheet, openStep, RequestLine } from "./ActionSheet";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
  stepId: number;
}

interface Values {
  new_approver: string;
  reason: string;
}

const BY_CODE = {
  "request.approver_without_account": "new_approver",
  "request.own_request": "new_approver",
  "request.reason_required": "reason",
} as const;

/** UI 7.8: give the step to another active employee, never the requester (REQ-13). */
export function ReassignSheet({ open, onOpenChange, request, stepId }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("reassign.title")} submitLabel={t("reassign.submit")}>
      {(formId) => <ReassignForm formId={formId} request={request} stepId={stepId} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function ReassignForm({ formId, request, stepId, onDone }: { formId: string; request: RequestOut; stepId: number; onDone: () => void }) {
  const { t } = useRequestsText();
  const reassign = useReassignStep();
  const form = useForm<Values>({ defaultValues: { new_approver: "", reason: "" } });
  const approver = useController({ control: form.control, name: "new_approver" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const current = openStep(request).waitingOn.join(", ");

  const [save] = useSingleFlight(async (values: Values) => {
    const reason = values.reason.trim();
    if (values.new_approver === "") form.setError("new_approver", { type: "client", message: t("reassign.newRequired") });
    if (reason === "") form.setError("reason", { type: "client", message: t("formErrors.reasonRequired") });
    if (values.new_approver === "" || reason === "") return;
    try {
      await reassign.mutateAsync({ stepId, body: { new_approver: values.new_approver, reason } });
      toast(t("reassign.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(["new_approver", "reason"], BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <RequestLine request={request} />
      <p className="text-body">{current === "" ? t("reassign.currentNone") : t("reassign.current", { names: current })}</p>
      <FormSummary problems={details(loose)} />
      <EmployeePicker
        label={t("reassign.new")}
        value={approver.field.value === "" ? null : approver.field.value}
        onChange={(publicId) => approver.field.onChange(publicId ?? "")}
        exclude={[request.employee.public_id]}
        error={approver.fieldState.error?.message}
      />
      <TextAreaField control={form.control} name="reason" label={t("common.reason")} />
    </form>
  );
}
