import { useEffect, useState } from "react";
import { useController, useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FileField, FormSummary, SelectField, TextAreaField, TextField, toast } from "@/components";
import { isFullRecord, useEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { isConflict, useRecordOnBehalf } from "../../api";
import { canSendBack } from "../../decisions/DecisionSheet";
import { fileProblem } from "../../form/schema";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import type { Decision, RequestOut } from "../../types";
import { ActionSheet, openStep, RequestLine } from "./ActionSheet";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
  /** The step the decision is recorded for: `request.viewer.step_id`. */
  stepId: number;
}

interface Values {
  decided_by: string;
  decision: Decision;
  decided_at: string;
  channel: "verbal" | "paper";
  note: string;
  scan: File | null;
}

const FIELDS = ["decided_by", "decision", "decided_at", "channel", "note", "scan"] as const;
const BY_CODE = {
  "request.decided_at_future": "decided_at",
  "request.channel_invalid": "channel",
  "request.reason_required": "note",
  "request.comment_required": "note",
  "request.own_request": "decided_by",
  // Who decided must be one of the people the step is for (plan 03a, at review).
  "request.decided_by_not_approver": "decided_by",
  "request.amendment_cannot_return": "decision",
  "files.too_large": "scan",
  "files.type_not_allowed": "scan",
  "files.content_mismatch": "scan",
  "files.empty": "scan",
} as const;

/** Now in Tunis, as a `datetime-local` input takes it: "2026-11-05T10:30". */
function nowInTunis(): string {
  const text = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis", dateStyle: "short", timeStyle: "short" }).format(new Date());
  return text.replace(" ", "T");
}

/** Tunis is at UTC+1 all year, so a local time there always carries the same offset. */
const asInstant = (local: string) => `${local}:00+01:00`;

/** UI 7.8: record a decision an approver gave verbally or on paper (REQ-10). */
export function RecordOnBehalfSheet({ open, onOpenChange, request, stepId }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("onBehalf.title")} submitLabel={t("onBehalf.submit")}>
      {(formId) => <RecordForm formId={formId} request={request} stepId={stepId} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function RecordForm({ formId, request, stepId, onDone }: { formId: string; request: RequestOut; stepId: number; onDone: () => void }) {
  const { t } = useRequestsText();
  const record = useRecordOnBehalf();
  const form = useForm<Values>({
    defaultValues: { decided_by: "", decision: "approve", decided_at: nowInTunis(), channel: "verbal", note: "", scan: null },
  });
  const who = useController({ control: form.control, name: "decided_by" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  // "Who decided" defaults to the step's approver: on a manager's step, the requester's manager.
  const requester = useEmployee(request.employee.public_id);
  const managerId = requester.data && isFullRecord(requester.data) ? (requester.data.manager?.public_id ?? "") : "";
  const step = openStep(request);
  const onManagerStep = step.key === "waiting_manager";
  useEffect(() => {
    if (managerId !== "" && onManagerStep && form.getValues("decided_by") === "") form.setValue("decided_by", managerId);
  }, [managerId, onManagerStep, form]);

  const decisions: Decision[] = canSendBack(request) ? ["approve", "reject", "return"] : ["approve", "reject"];
  const waitingOn = step.waitingOn.join(", ");

  const [save] = useSingleFlight(async (values: Values) => {
    const note = values.note.trim();
    const scanMessage = values.scan ? fileProblem(values.scan, t) : null;
    if (values.decided_by === "") form.setError("decided_by", { type: "client", message: t("onBehalf.whoRequired") });
    if (values.decided_at === "") form.setError("decided_at", { type: "client", message: t("onBehalf.whenRequired") });
    if (note === "") form.setError("note", { type: "client", message: t("onBehalf.noteRequired") });
    if (scanMessage) form.setError("scan", { type: "client", message: scanMessage });
    if (values.decided_by === "" || values.decided_at === "" || note === "" || scanMessage) return;
    try {
      await record.mutateAsync({
        stepId,
        input: {
          decided_by: values.decided_by,
          decision: values.decision,
          decided_at: asInstant(values.decided_at),
          channel: values.channel,
          note,
          version: request.version,
          scan: values.scan,
        },
      });
      toast(t("onBehalf.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(FIELDS, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <RequestLine request={request} />
      <FormSummary problems={details(loose)} />
      <EmployeePicker
        label={t("onBehalf.who")}
        value={who.field.value === "" ? null : who.field.value}
        onChange={(publicId) => who.field.onChange(publicId ?? "")}
        exclude={[request.employee.public_id]}
        hint={waitingOn === "" ? undefined : t("onBehalf.whoHint", { names: waitingOn })}
        error={who.fieldState.error?.message}
      />
      <SelectField
        control={form.control}
        name="decision"
        label={t("onBehalf.decision")}
        options={decisions.map((decision) => ({ value: decision, label: t(`onBehalf.decisions.${decision}`) }))}
      />
      <TextField control={form.control} name="decided_at" label={t("onBehalf.when")} type="datetime-local" max={nowInTunis()} />
      <SelectField
        control={form.control}
        name="channel"
        label={t("onBehalf.channel")}
        options={[
          { value: "verbal", label: t("onBehalf.channels.verbal") },
          { value: "paper", label: t("onBehalf.channels.paper") },
        ]}
      />
      <TextAreaField control={form.control} name="note" label={t("onBehalf.note")} />
      <FileField control={form.control} name="scan" label={t("onBehalf.scan")} optional hint={t("form.fileHint")} />
    </form>
  );
}
