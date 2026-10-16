import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { DateField, FormSummary, SwitchField, TextAreaField, TimeField, toast } from "@/components";
import { formatDays, formatHours } from "@/lib/format";
import { isConflict, useCancelRequest, useCorrectRequest, usePreview, useRequestTypes } from "../../api";
import { currentDates, DATE_FIELD_BY_CODE, dateIssues, datesOf, datesReady, sameAsCurrent, type DateValues } from "../../dates";
import { FieldError } from "../../form/FieldError";
import { useDebounced } from "../../form/useDebounced";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import { describeQuantity, describeWhen } from "../../text";
import type { PreviewBody, RequestOut } from "../../types";
import { ActionSheet } from "./ActionSheet";

type Kind = "correct" | "cancel";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
}

interface Values extends DateValues {
  reason: string;
}

const BY_CODE: Record<string, Path<Values>> = { ...DATE_FIELD_BY_CODE, "request.reason_required": "reason" };

/** UI 7.8: correct, shorten or cancel any request directly, with a mandatory reason (REQ-09). */
export function CorrectSheet({ open, onOpenChange, request }: SheetProps) {
  const { t } = useRequestsText();
  const canCorrect = request.viewer.actions.includes("correct");
  const canCancel = request.viewer.actions.includes("cancel");
  const [kind, setKind] = useState<Kind>(canCorrect ? "correct" : "cancel");
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("correct.title")}
      submitLabel={t(kind === "correct" ? "correct.submitCorrect" : "correct.submitCancel")}
      destructive={kind === "cancel"}
    >
      {(formId) => (
        <CorrectForm
          formId={formId}
          request={request}
          kind={kind}
          onKind={canCorrect && canCancel ? setKind : undefined}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ActionSheet>
  );
}

interface CorrectFormProps {
  formId: string;
  request: RequestOut;
  kind: Kind;
  /** Given when both actions are allowed: the choice between them is then offered. */
  onKind?: (kind: Kind) => void;
  onDone: () => void;
}

function CorrectForm({ formId, request, kind, onKind, onDone }: CorrectFormProps) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const correct = useCorrectRequest();
  const cancel = useCancelRequest();
  const form = useForm<Values>({ defaultValues: { ...currentDates(request), reason: "" } });
  const values = useWatch({ control: form.control }) as Values;
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const correcting = kind === "correct";
  const hourly = request.type.unit === "hour";
  const type = types.data?.find((item) => item.code === request.type.code);
  const allowsHalfDay = type?.allows_half_day ?? (request.starts_at_midday || request.ends_at_midday);
  const deducts = type?.balance_effect === "deducts_annual";
  const amount = (value: string | number) => (hourly ? formatHours(value, lang) : formatDays(value, lang));

  // HR's correction lifts limits like an HR exception, and the request must not collide with itself.
  const body: PreviewBody | null =
    correcting && datesReady(values, hourly)
      ? {
          type: request.type.code,
          employee: request.employee.public_id,
          request: request.public_id,
          ...datesOf(values, hourly),
          exceptional_event: request.event?.id ?? null,
          override: true,
        }
      : null;
  const key = body ? JSON.stringify(body) : "";
  const settledKey = useDebounced(key, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const computed = key !== "" && key === settledKey && preview.isSuccess && !preview.isPlaceholderData ? preview.data : undefined;
  const difference = computed ? Number(computed.quantity) - Number(request.quantity) : 0;

  const shown: Path<Values>[] = !correcting
    ? ["reason"]
    : hourly
      ? ["reason", "start_date", "start_time", "end_time"]
      : allowsHalfDay
        ? ["reason", "start_date", "end_date", "starts_at_midday", "ends_at_midday"]
        : ["reason", "start_date", "end_date"];
  const resolve = (problem: FieldProblem) => {
    const field = byName<Values>(shown, BY_CODE)(problem);
    return field !== null && shown.includes(field) ? field : null;
  };

  const [save] = useSingleFlight(async (current: Values) => {
    const reason = current.reason.trim();
    const issues = correcting ? dateIssues(current, hourly, t) : [];
    if (correcting && issues.length === 0 && sameAsCurrent(current, request)) issues.push(["start_date", t("change.unchanged")]);
    for (const [path, message] of issues) form.setError(path, { type: "client", message });
    if (reason === "") form.setError("reason", { type: "client", message: t("formErrors.reasonRequired") });
    if (issues.length > 0 || reason === "") return;
    try {
      if (correcting) await correct.mutateAsync({ id: request.public_id, body: { ...datesOf(current, hourly), reason } });
      else await cancel.mutateAsync({ id: request.public_id, reason });
      toast(t(correcting ? "correct.doneCorrect" : "correct.doneCancel"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, resolve));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body text-text-secondary">
        {t("change.current", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
      </p>

      {onKind && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-body font-medium">{t("correct.kindLegend")}</legend>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" name={`${formId}-kind`} checked={correcting} onChange={() => onKind("correct")} />
            {t("correct.kindCorrect")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" name={`${formId}-kind`} checked={!correcting} onChange={() => onKind("cancel")} />
            {t("correct.kindCancel")}
          </label>
        </fieldset>
      )}

      <FormSummary problems={details([...loose, ...(computed?.problems ?? [])])} />

      {correcting && !hourly && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField control={form.control} name="start_date" label={t("form.start")} />
            <DateField control={form.control} name="end_date" label={t("form.end")} />
          </div>
          {allowsHalfDay && (
            <>
              <SwitchField control={form.control} name="starts_at_midday" label={t("form.startsAtMidday")} />
              <SwitchField control={form.control} name="ends_at_midday" label={t("form.endsAtMidday")} />
              <FieldError control={form.control} name="starts_at_midday" />
              <FieldError control={form.control} name="ends_at_midday" />
            </>
          )}
        </>
      )}
      {correcting && hourly && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DateField control={form.control} name="start_date" label={t("form.date")} />
          <TimeField control={form.control} name="start_time" label={t("form.from")} />
          <TimeField control={form.control} name="end_time" label={t("form.to")} />
        </div>
      )}

      {correcting && computed && (
        <dl aria-label={t("form.computed")} className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t("change.newCount")}</dt>
            <dd className="text-section font-semibold">{amount(computed.quantity)}</dd>
          </div>
          {deducts && (
            <div>
              <dt className="text-caption text-muted-foreground">{t("change.balanceEffect")}</dt>
              <dd className="text-body">
                {difference > 0
                  ? t("change.uses", { amount: amount(difference) })
                  : difference < 0
                    ? t("change.gives", { amount: amount(-difference) })
                    : t("change.same")}
              </dd>
            </div>
          )}
        </dl>
      )}
      {!correcting && deducts && request.status === "approved" && (
        <p className="text-body text-text-secondary">{t("correct.cancelGives", { amount: amount(request.quantity) })}</p>
      )}

      <TextAreaField control={form.control} name="reason" label={t("common.reason")} />
      <p className="text-caption text-muted-foreground">{t("correct.told", { name: request.employee.name })}</p>
    </form>
  );
}
