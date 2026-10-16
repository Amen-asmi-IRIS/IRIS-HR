import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { DateField, FileField, FormSummary, SelectField, SwitchField, TextAreaField, TimeField, useIsPhone } from "@/components";
import { Button } from "@/components/ui/button";
import { refreshRequests, requestsApi, useEvents, usePreview } from "../api";
import { useRequestsText, useViewer } from "../platform";
import { details, serverProblems } from "../problems";
import type { PreviewBody, RequestDetail, RequestTypeOut } from "../types";
import { useDraftKeeper } from "./draftKeeper";
import { FieldError } from "./FieldError";
import { PreviewPanel } from "./PreviewPanel";
import { fieldFor, FORM_FIELDS, type FormField } from "./problemFields";
import { buildSchema, EMPTY, fromRequest, previewReady, toFields, visibleFields, type FormValues } from "./schema";
import { useDebounced } from "./useDebounced";
import { useSingleFlight } from "./useSingleFlight";

export interface RequestFormProps {
  type: RequestTypeOut;
  /** "me": an employee for themselves. "hr": HR for an employee, with the exception choice. */
  mode: "me" | "hr";
  /** Names this form for the keeper of unsent values. Also pass it as the React `key`. */
  formId: string;
  /** In "hr" mode, the employee the request is for. */
  employeeId?: string;
  /** The request being edited: a draft, one sent back, or a pending one nobody decided. */
  existing?: RequestDetail;
  /** Pre-fills the first day (a day chosen on the calendar), and the last day too unless `initialEnd` is given. */
  initialDate?: string;
  /** Pre-fills the last day when it differs from the first. */
  initialEnd?: string;
  onDone: (result: { request: RequestDetail; sent: boolean }) => void;
  onCancel: () => void;
}

interface Failure {
  loose: FieldProblem[];
  codes: string[];
}

const NO_FAILURE: Failure = { loose: [], codes: [] };

interface PreviewContext {
  employeeId: string | undefined;
  /** The request these values belong to, once it exists. */
  requestId: string | undefined;
  override: boolean;
}

function previewBodyOf(values: FormValues, type: RequestTypeOut, { employeeId, requestId, override }: PreviewContext): PreviewBody {
  const fields = toFields(values, type);
  return {
    type: type.code,
    ...(employeeId ? { employee: employeeId } : {}),
    ...(requestId ? { request: requestId } : {}),
    start_date: fields.start_date,
    end_date: fields.end_date,
    starts_at_midday: fields.starts_at_midday,
    ends_at_midday: fields.ends_at_midday,
    start_time: fields.start_time,
    end_time: fields.end_time,
    exceptional_event: fields.exceptional_event,
    override,
  };
}

export function RequestForm({ type, mode, formId, employeeId, existing, initialDate, initialEnd, onDone, onCancel }: RequestFormProps) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const qc = useQueryClient();

  // The form starts from the request as it was when the page opened; a later refetch never overwrites typing.
  const [initial] = useState<FormValues>(() =>
    existing ? fromRequest(existing) : { ...EMPTY, start_date: initialDate ?? "", end_date: initialEnd ?? initialDate ?? "" },
  );
  const schema = useMemo(() => buildSchema(type, t), [type, t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const keeper = useDraftKeeper(viewer.publicId, formId, form);
  // The keeper restores what was typed on an earlier visit. A day just chosen on the calendar wins over it:
  // this effect runs after the keeper's own, once, when the form opens.
  useEffect(() => {
    if (!existing && initialDate) {
      form.setValue("start_date", initialDate, { shouldDirty: true });
      form.setValue("end_date", initialEnd ?? initialDate, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form opens
  }, []);
  const watched = useWatch({ control: form.control });
  const values = useMemo(() => ({ ...EMPTY, ...watched }) as FormValues, [watched]);

  const [saved, setSaved] = useState(existing ? { id: existing.public_id, version: existing.version } : null);
  const [failure, setFailure] = useState<Failure>(NO_FAILURE);
  // Once the request is saved or sent, the form has done its job: a click that arrives after that sends nothing.
  const finished = useRef(false);

  const events = useEvents(type.uses_events);
  const offeredEvents = (events.data ?? []).filter(
    (event) => event.is_active || String(event.id) === values.exceptional_event,
  );
  const proofRequired = offeredEvents.find((event) => String(event.id) === values.exceptional_event)?.proof_required ?? false;
  const isHr = mode === "hr";
  const phone = useIsPhone();
  // HR chooses the exception until the request exists; from then on it is the request's own.
  const canChooseOverride = isHr && saved === null;
  const override = existing ? existing.has_override : isHr && values.override;
  const visible = useMemo(
    () => visibleFields(type, { hr: canChooseOverride, override: values.override, proofRequired }),
    [type, canChooseOverride, values.override, proofRequired],
  );

  // ---- what the server computes for the current values
  const ready = previewReady(values, type);
  const previewKey = ready
    ? JSON.stringify(previewBodyOf(values, type, { employeeId, requestId: saved?.id, override }))
    : "";
  const settledKey = useDebounced(previewKey, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const previewIsCurrent =
    previewKey !== "" && previewKey === settledKey && preview.isSuccess && !preview.isPlaceholderData;
  const previewProblems = previewIsCurrent && preview.data ? preview.data.problems : null;

  /** Puts each problem on its input and clears server problems that no longer apply. */
  const showOnFields = useCallback(
    (problems: FieldProblem[]) => {
      const shown = new Set<FormField>();
      for (const problem of problems) {
        const field = fieldFor(problem, visible);
        if (field === null) continue;
        shown.add(field);
        form.setError(field, { type: `server:${problem.code}`, message: problem.detail });
      }
      for (const field of FORM_FIELDS) {
        const kind = form.getFieldState(field).error?.type;
        if (!shown.has(field) && typeof kind === "string" && kind.startsWith("server:")) form.clearErrors(field);
      }
    },
    [form, visible],
  );

  useEffect(() => {
    if (previewProblems !== null) showOnFields(previewProblems);
  }, [previewProblems, showOnFields]);

  // A change to any value makes the last failed attempt irrelevant.
  useEffect(() => {
    const subscription = form.watch(() => setFailure(NO_FAILURE));
    return () => subscription.unsubscribe();
  }, [form]);

  const previewLoose = useMemo(
    () => (previewProblems ?? []).filter((problem) => fieldFor(problem, visible) === null),
    [previewProblems, visible],
  );
  const codes = [...failure.codes, ...(previewProblems ?? []).map((problem) => problem.code)];

  // ---- saving and sending
  function showFailure(error: unknown) {
    setFailure({
      loose: serverProblems(form, error, t, (problem) => fieldFor(problem, visible)),
      codes: error instanceof ProblemError ? error.errors.map((problem) => problem.code) : [],
    });
  }

  async function persist(current: FormValues): Promise<RequestDetail> {
    const fields = toFields(current, type);
    const reason = isHr && current.override ? { override_reason: current.override_reason.trim() } : {};
    let request = saved
      ? await requestsApi.update(saved.id, { ...fields, version: saved.version })
      : await requestsApi.create({ type: type.code, ...(employeeId ? { employee: employeeId } : {}), ...fields, ...reason });
    setSaved({ id: request.public_id, version: request.version });
    if (current.file) {
      await requestsApi.attach(request.public_id, current.file);
      form.setValue("file", null);
      request = await requestsApi.detail(request.public_id);
      setSaved({ id: request.public_id, version: request.version });
    }
    return request;
  }

  const [send, sending] = useSingleFlight(async (current: FormValues) => {
    if (finished.current) return;
    if (previewProblems !== null && previewProblems.length > 0) {
      // The server already said these values cannot be sent: show why again, on the field, and send nothing.
      showOnFields(previewProblems);
      const first = previewProblems
        .map((problem) => fieldFor(problem, visible))
        .find((field): field is FormField => field !== null);
      if (first) form.setFocus(first);
      return;
    }
    try {
      let request = await persist(current);
      if (request.viewer.actions.includes("submit")) {
        request = await requestsApi.submit(request.public_id, request.version);
      }
      finished.current = true;
      keeper.clear();
      await refreshRequests(qc);
      onDone({ request, sent: true });
    } catch (error) {
      showFailure(error);
      await refreshRequests(qc);
    }
  });

  const [saveForLater, saving] = useSingleFlight(async (current: FormValues) => {
    if (finished.current) return;
    try {
      const request = await persist(current);
      finished.current = true;
      keeper.clear();
      await refreshRequests(qc);
      onDone({ request, sent: false });
    } catch (error) {
      showFailure(error);
      await refreshRequests(qc);
    }
  });

  function startOver() {
    keeper.clear();
    form.reset(initial);
  }

  function cancel() {
    keeper.clear();
    onCancel();
  }

  const status = existing?.status;
  const primaryLabel = status === "pending" ? t("form.saveChanges") : status === "returned" ? t("form.sendAgain") : t("common.send");
  const actions = (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button type="submit" variant="primary" aria-busy={sending}>
        {sending ? t("form.sending") : primaryLabel}
      </Button>
      {status !== "pending" && (
        <Button type="button" variant="secondary" aria-busy={saving} onClick={form.handleSubmit(saveForLater)}>
          {t("form.saveForLater")}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={cancel}>
        {t("common.cancel")}
      </Button>
    </div>
  );

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(send)}
      aria-busy={sending || saving}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-5">
        {keeper.restored && (
          <p role="status" className="rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
            {t("keeper.restored")}{" "}
            <Button type="button" variant="link" onClick={startOver}>
              {t("keeper.startOver")}
            </Button>
          </p>
        )}
        <FormSummary problems={details([...failure.loose, ...previewLoose])} />

        {type.unit === "day" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={form.control} name="start_date" label={t("form.start")} />
              <DateField control={form.control} name="end_date" label={t("form.end")} />
            </div>
            {visible.has("starts_at_midday") && (
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField control={form.control} name="start_date" label={t("form.date")} />
            <TimeField control={form.control} name="start_time" label={t("form.from")} />
            <TimeField control={form.control} name="end_time" label={t("form.to")} />
          </div>
        )}

        {visible.has("exceptional_event") && (
          <SelectField
            control={form.control}
            name="exceptional_event"
            label={t("form.event")}
            placeholder={t("form.eventPlaceholder")}
            options={offeredEvents.map((event) => ({ value: String(event.id), label: event.name }))}
          />
        )}

        <TextAreaField
          control={form.control}
          name="comment"
          label={t("form.comment")}
          optional
          hint={type.is_sensitive ? t("form.commentSensitiveHint") : undefined}
        />

        {visible.has("file") && (
          <FileField
            control={form.control}
            name="file"
            label={t(type.is_sensitive ? "form.certificate" : "form.proof")}
            hint={t(type.document_rule === "required_within_deadline" ? "form.fileLaterHint" : "form.fileHint")}
            accept=".pdf,.jpg,.jpeg,.png"
          />
        )}

        {canChooseOverride && (
          <>
            <SwitchField control={form.control} name="override" label={t("form.override")} hint={t("form.overrideHint")} />
            {values.override && <TextAreaField control={form.control} name="override_reason" label={t("form.overrideReason")} />}
          </>
        )}
        {isHr && !canChooseOverride && <p className="text-caption text-muted-foreground">{t("form.overrideFixed")}</p>}
        {isHr && <p className="text-caption text-muted-foreground">{t("form.followsSteps")}</p>}

        {codes.includes("request.balance_insufficient") && (
          <p className="text-body text-text-secondary">{t(isHr ? "form.balanceHintHr" : "form.balanceHint")}</p>
        )}

        {!phone && actions}
      </div>

      <PreviewPanel type={type} preview={ready ? preview.data : undefined} mode={mode} />
      {/* On a phone the panel comes under the fields: the actions follow it, so it is read before Send. */}
      {phone && actions}
    </form>
  );
}
