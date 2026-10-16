import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { z } from "zod";
import type { FieldProblem } from "@/api/problem";
import { DateField, FormSummary, PageHeader, SwitchField, TextAreaField, TimeField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays, formatHours } from "@/lib/format";
import { useOpenAmendment, usePreview, useRequest, useRequestTypes } from "../api";
import { currentDates, DATE_FIELD_BY_CODE, dateIssues, datesOf, datesReady, sameAsCurrent, type DateValues } from "../dates";
import { chainSentence } from "../form/chain";
import { FieldError } from "../form/FieldError";
import { useDebounced } from "../form/useDebounced";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import { describeQuantity, describeWhen } from "../text";
import type { AmendmentBody, PreviewBody, RequestDetail } from "../types";

interface ChangeValues extends DateValues {
  kind: "change" | "cancel";
  reason: string;
}

const BY_CODE: Record<string, Path<ChangeValues>> = { ...DATE_FIELD_BY_CODE, "request.reason_required": "reason" };

function buildChangeSchema(request: RequestDetail, t: Translate) {
  const hourly = request.type.unit === "hour";
  return z
    .object({
      kind: z.enum(["change", "cancel"]),
      start_date: z.string(),
      end_date: z.string(),
      starts_at_midday: z.boolean(),
      ends_at_midday: z.boolean(),
      start_time: z.string(),
      end_time: z.string(),
      reason: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: keyof ChangeValues, message: string) => context.addIssue({ code: "custom", path: [path], message });
      if (values.reason.trim() === "") issue("reason", t("formErrors.reasonRequired"));
      if (values.kind === "cancel") return;
      for (const [path, message] of dateIssues(values, hourly, t)) issue(path, message);
      if (sameAsCurrent(values, request)) issue("start_date", t("change.unchanged"));
    });
}

function ChangeForm({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const types = useRequestTypes();
  const openAmendment = useOpenAmendment();
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const requestPage = `/me/requests/${request.public_id}`;
  const hourly = request.type.unit === "hour";
  const type = types.data?.find((item) => item.code === request.type.code);
  const allowsHalfDay = type?.allows_half_day ?? (request.starts_at_midday || request.ends_at_midday);
  const deducts = type?.balance_effect === "deducts_annual";
  const amount = (value: string | number) => (hourly ? formatHours(value, lang) : formatDays(value, lang));

  const schema = useMemo(() => buildChangeSchema(request, t), [request, t]);
  const form = useForm<ChangeValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: search.get("kind") === "cancel" ? "cancel" : "change",
      ...currentDates(request),
      reason: "",
    },
  });
  const values = useWatch({ control: form.control }) as ChangeValues;
  const changing = values.kind === "change";

  // The preview gives the new count and the chain. For a cancellation it is asked with the
  // current dates, for the chain only.
  const ready = !changing || datesReady(values, hourly);
  const dates = datesOf(changing ? values : currentDates(request), hourly);
  const body: PreviewBody | null = ready
    ? {
        type: request.type.code,
        // The request being amended: the server then does not hold it against its own change.
        request: request.public_id,
        ...dates,
        exceptional_event: request.event?.id ?? null,
        override: false,
      }
    : null;
  const key = body ? JSON.stringify(body) : "";
  const settledKey = useDebounced(key, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const computed = key !== "" && key === settledKey && preview.isSuccess && !preview.isPlaceholderData ? preview.data : undefined;
  const previewProblems = changing && computed ? computed.problems : [];
  const difference = computed ? Number(computed.quantity) - Number(request.quantity) : 0;

  const shown: Path<ChangeValues>[] = !changing
    ? ["reason"]
    : hourly
      ? ["reason", "start_date", "start_time", "end_time"]
      : allowsHalfDay
        ? ["reason", "start_date", "end_date", "starts_at_midday", "ends_at_midday"]
        : ["reason", "start_date", "end_date"];
  const resolve = (problem: FieldProblem) => {
    const field = byName<ChangeValues>(shown, BY_CODE)(problem);
    return field !== null && shown.includes(field) ? field : null;
  };

  const [send, sending] = useSingleFlight(async (current: ChangeValues) => {
    const reason = current.reason.trim();
    const amendment: AmendmentBody =
      current.kind === "cancel" ? { kind: "cancel", reason } : { kind: "change", ...datesOf(current, hourly), reason };
    try {
      await openAmendment.mutateAsync({ id: request.public_id, body: amendment });
      toast(t(current.kind === "cancel" ? "change.sentCancel" : "change.sentChange"));
      navigate(requestPage);
    } catch (error) {
      setLoose(serverProblems(form, error, t, resolve));
    }
  });

  return (
    <>
      <PageHeader title={t("change.title")} back={requestPage} />
      <form noValidate onSubmit={form.handleSubmit(send)} className="flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-card px-6 py-5">
        <p className="text-body text-text-secondary">
          {t("change.current", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
        </p>
        <p className="text-body">{t("change.stays")}</p>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-body font-medium">{t("change.kindLegend")}</legend>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" value="change" {...form.register("kind")} />
            {t("mine.changeDates")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" value="cancel" {...form.register("kind")} />
            {t("mine.cancelRequest")}
          </label>
        </fieldset>

        <FormSummary problems={details([...loose, ...previewProblems])} />

        {changing && !hourly && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={form.control} name="start_date" label={t("form.start")} />
              <DateField control={form.control} name="end_date" label={t("form.end")} />
            </div>
            {allowsHalfDay && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SwitchField control={form.control} name="starts_at_midday" label={t("form.startsAtMidday")} />
                  <SwitchField control={form.control} name="ends_at_midday" label={t("form.endsAtMidday")} />
                </div>
                <FieldError control={form.control} name="starts_at_midday" />
                <FieldError control={form.control} name="ends_at_midday" />
              </>
            )}
          </>
        )}
        {changing && hourly && (
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField control={form.control} name="start_date" label={t("form.date")} />
            <TimeField control={form.control} name="start_time" label={t("form.from")} />
            <TimeField control={form.control} name="end_time" label={t("form.to")} />
          </div>
        )}

        {computed && (
          <dl aria-label={t("form.computed")} className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3">
            {changing && (
              <div>
                <dt className="text-caption text-muted-foreground">{t("change.newCount")}</dt>
                <dd className="text-section font-semibold">{amount(computed.quantity)}</dd>
              </div>
            )}
            {changing && deducts && (
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
            <div>
              <dt className="text-caption text-muted-foreground">{t("form.whoDecides")}</dt>
              <dd className="text-body">{chainSentence(computed.chain, t, "me")}</dd>
            </div>
          </dl>
        )}
        {!changing && deducts && (
          <p className="text-body text-text-secondary">{t("change.cancelGives", { amount: amount(request.quantity) })}</p>
        )}

        <TextAreaField control={form.control} name="reason" label={t("change.reason")} />

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t(changing ? "change.sendChange" : "change.sendCancel")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(requestPage)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </>
  );
}

/** /me/requests/:id/change : change the dates of an approved request, or cancel it, through an amendment. */
export default function ChangeOrCancelPage() {
  const { id = "" } = useParams();
  const query = useRequest(id);
  return (
    <Gate query={query} form>
      {(request) =>
        request.viewer.actions.includes("amend") ? (
          <ChangeForm key={request.public_id} request={request} />
        ) : (
          <Navigate to={`/me/requests/${id}`} replace />
        )
      }
    </Gate>
  );
}
