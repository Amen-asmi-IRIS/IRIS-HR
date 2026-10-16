import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { FormSummary, TextAreaField, toast } from "@/components";
import { formatDays } from "@/lib/format";
import { isConflict, usePreview, useReclassifyRequest } from "../../api";
import { currentDates, datesOf } from "../../dates";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import { describeQuantity, describeWhen } from "../../text";
import type { RequestOut } from "../../types";
import { ActionSheet } from "./ActionSheet";

/** The seeded code of annual leave (master 7.9), the type a reclassified sick leave becomes. */
const ANNUAL = "annual";
const SHORT = "request.balance_insufficient";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
}

interface Values {
  override_reason: string;
}

/** UI 7.8: count a sick leave as annual leave; it is HR's decision on the request (PRD 6.5, master D17). */
export function ReclassifySheet({ open, onOpenChange, request }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("reclassify.title")} submitLabel={t("reclassify.submit")}>
      {(formId) => <ReclassifyForm formId={formId} request={request} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function ReclassifyForm({ formId, request, onDone }: { formId: string; request: RequestOut; onDone: () => void }) {
  const { t, lang } = useRequestsText();
  const reclassify = useReclassifyRequest();
  const form = useForm<Values>({ defaultValues: { override_reason: "" } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const [refused, setRefused] = useState(false);

  // What the same days would mean as annual leave. Only the balance matters: the other rules of
  // the annual type (notice, past dates) do not apply to a leave that was already taken.
  const preview = usePreview({
    type: ANNUAL,
    employee: request.employee.public_id,
    request: request.public_id,
    ...datesOf(currentDates(request), false),
    exceptional_event: null,
    override: false,
  });
  const balance = preview.data?.balance ?? null;
  const shortInPreview = (preview.data?.problems ?? []).find((problem) => problem.code === SHORT);
  const needsReason = refused || shortInPreview !== undefined;

  const [save] = useSingleFlight(async (values: Values) => {
    const reason = values.override_reason.trim();
    if (needsReason && reason === "") {
      form.setError("override_reason", { type: "client", message: t("formErrors.reasonRequired") }, { shouldFocus: true });
      return;
    }
    try {
      await reclassify.mutateAsync({ id: request.public_id, overrideReason: needsReason ? reason : "" });
      toast(t("reclassify.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      if (error instanceof ProblemError && error.errors.some((problem) => problem.code === SHORT)) setRefused(true);
      setLoose(serverProblems(form, error, t, byName<Values>(["override_reason"], { "request.reason_required": "override_reason" })));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body">
        {t("reclassify.days", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
      </p>
      <p className="text-body">{t("reclassify.consequence", { name: request.employee.name })}</p>
      {balance && (
        <dl className="flex gap-6 rounded-md bg-muted px-4 py-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t("reclassify.balanceNow")}</dt>
            <dd className="text-body font-semibold">{formatDays(balance.now, lang)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">{t("reclassify.balanceAfter")}</dt>
            <dd className="text-body font-semibold">{formatDays(balance.after, lang)}</dd>
          </div>
        </dl>
      )}
      <FormSummary problems={details(loose.length > 0 ? loose : shortInPreview ? [shortInPreview] : [])} />
      {needsReason && (
        <>
          <p className="text-body text-text-secondary">{t("reclassify.short")}</p>
          <TextAreaField control={form.control} name="override_reason" label={t("reclassify.reason")} />
        </>
      )}
    </form>
  );
}
