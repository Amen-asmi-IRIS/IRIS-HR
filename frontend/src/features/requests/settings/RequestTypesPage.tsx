import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Link } from "react-router";
import type { FieldProblem } from "@/api/problem";
import {
  DataTable, EmptyState, FormSummary, PageHeader, SelectField, StatusBadge, SwitchField, TaskSheet, TextField, toast,
  type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n";
import { formatDays, formatHours } from "@/lib/format";
import { useRequestTypes, useSaveType } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { CalendarLabel, RequestTypeInput, RequestTypeOut, Unit } from "../types";

type CapPeriod = RequestTypeOut["cap_period"];

/** A type as its form edits it: numbers as text, the two "none or something" attributes as switches. */
interface TypeValues {
  code: string;
  name_fr: string;
  name_en: string;
  description_fr: string;
  description_en: string;
  unit: Unit;
  allows_half_day: boolean;
  deducts: boolean;
  document_required: boolean;
  document_deadline_hours: string;
  allows_past_dates: boolean;
  notice_days: string;
  cap_period: CapPeriod;
  cap_quantity: string;
  reduces_meal_tickets: boolean;
  calendar_label: CalendarLabel;
  is_sensitive: boolean;
  uses_events: boolean;
  is_active: boolean;
  sort_order: string;
}

const NEW_TYPE: TypeValues = {
  code: "",
  name_fr: "",
  name_en: "",
  description_fr: "",
  description_en: "",
  unit: "day",
  allows_half_day: false,
  deducts: false,
  document_required: false,
  document_deadline_hours: "",
  allows_past_dates: false,
  notice_days: "0",
  cap_period: "none",
  cap_quantity: "",
  reduces_meal_tickets: false,
  calendar_label: "absent",
  is_sensitive: false,
  uses_events: false,
  is_active: true,
  sort_order: "100",
};

function toValues(type: RequestTypeOut): TypeValues {
  return {
    code: type.code,
    name_fr: type.name_fr,
    name_en: type.name_en,
    description_fr: type.description_fr,
    description_en: type.description_en,
    unit: type.unit,
    allows_half_day: type.allows_half_day,
    deducts: type.balance_effect === "deducts_annual",
    document_required: type.document_rule === "required_within_deadline",
    document_deadline_hours: type.document_deadline_hours === null ? "" : String(type.document_deadline_hours),
    allows_past_dates: type.allows_past_dates,
    notice_days: String(type.notice_days),
    cap_period: type.cap_period,
    cap_quantity: type.cap_quantity === null ? "" : String(Number(type.cap_quantity)),
    reduces_meal_tickets: type.reduces_meal_tickets,
    calendar_label: type.calendar_label,
    is_sensitive: type.is_sensitive,
    uses_events: type.uses_events,
    is_active: type.is_active,
    sort_order: String(type.sort_order),
  };
}

/** What is sent. An attribute whose input is hidden takes its neutral value (M7). */
function toInput(values: TypeValues): RequestTypeInput {
  const deadline = values.document_deadline_hours.trim();
  return {
    code: values.code.trim(),
    name_fr: values.name_fr.trim(),
    name_en: values.name_en.trim(),
    description_fr: values.description_fr.trim(),
    description_en: values.description_en.trim(),
    unit: values.unit,
    allows_half_day: values.unit === "day" && values.allows_half_day,
    balance_effect: values.deducts ? "deducts_annual" : "none",
    document_rule: values.document_required ? "required_within_deadline" : "none",
    document_deadline_hours: values.document_required && deadline !== "" ? Number(deadline) : null,
    allows_past_dates: values.allows_past_dates,
    notice_days: Number(values.notice_days),
    cap_quantity: values.cap_period === "none" ? null : values.cap_quantity.trim().replace(",", "."),
    cap_period: values.cap_period,
    reduces_meal_tickets: values.reduces_meal_tickets,
    calendar_label: values.calendar_label,
    is_sensitive: values.is_sensitive,
    uses_events: values.uses_events,
    is_active: values.is_active,
    sort_order: Number(values.sort_order),
  };
}

const WHOLE = /^\d+$/;

/** What cannot be right, as [input, message] pairs, before anything is sent. */
function issuesOf(values: TypeValues, isNew: boolean, t: Translate): [Path<TypeValues>, string][] {
  const issues: [Path<TypeValues>, string][] = [];
  const required = t("formErrors.required");
  if (isNew && values.code.trim() === "") issues.push(["code", required]);
  if (values.name_fr.trim() === "") issues.push(["name_fr", required]);
  if (values.name_en.trim() === "") issues.push(["name_en", required]);
  if (!WHOLE.test(values.notice_days.trim())) issues.push(["notice_days", t("settingsForm.whole")]);
  if (!WHOLE.test(values.sort_order.trim())) issues.push(["sort_order", t("settingsForm.whole")]);
  const deadline = values.document_deadline_hours.trim();
  if (values.document_required && deadline !== "" && !(WHOLE.test(deadline) && Number(deadline) > 0)) {
    issues.push(["document_deadline_hours", t("settingsForm.positive")]);
  }
  if (values.cap_period !== "none" && !(Number(values.cap_quantity.trim().replace(",", ".")) > 0)) {
    issues.push(["cap_quantity", t("settingsForm.positive")]);
  }
  return issues;
}

/** The inputs that have an error line of their own. A problem on any other field goes to the summary. */
const SHOWN: Path<TypeValues>[] = [
  "code", "name_fr", "name_en", "description_fr", "description_en", "unit", "document_deadline_hours", "notice_days",
  "cap_period", "cap_quantity", "calendar_label", "sort_order",
];
const BY_CODE: Record<string, Path<TypeValues>> = {
  "request.type_code_taken": "code",
  "request.type_cap_incomplete": "cap_quantity",
};

function documentText(type: RequestTypeOut, t: Translate): string {
  if (type.document_rule === "none") return t("common.no");
  return type.document_deadline_hours === null
    ? t("settingsTypes.documentRequired")
    : t("settingsTypes.documentWithin", { hours: type.document_deadline_hours });
}

function limitText(type: RequestTypeOut, t: Translate, lang: Lang): string {
  if (type.cap_period === "none" || type.cap_quantity === null) return t("settingsTypes.noLimit");
  const quantity = type.unit === "hour" ? formatHours(type.cap_quantity, lang) : formatDays(type.cap_quantity, lang);
  return t(`settingsTypes.limitPer.${type.cap_period}`, { quantity });
}

function TypeForm({ formId, type, onDone }: { formId: string; type: RequestTypeOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveType();
  const form = useForm<TypeValues>({ defaultValues: type ? toValues(type) : NEW_TYPE });
  const values = useWatch({ control: form.control }) as TypeValues;
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const isNew = type === null;
  const label = (name: string) => t(`settingsTypes.fields.${name}`);

  const [submit] = useSingleFlight(async (current: TypeValues) => {
    const issues = issuesOf(current, isNew, t);
    for (const [path, message] of issues) form.setError(path, { type: "client", message });
    if (issues.length > 0) return;
    try {
      await save.mutateAsync({ id: type?.id ?? null, body: toInput(current) });
      toast(t("settingsTypes.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<TypeValues>(SHOWN, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      {isNew && <TextField control={form.control} name="code" label={label("code")} hint={label("codeHint")} />}
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <TextField control={form.control} name="description_fr" label={label("description_fr")} hint={label("descriptionHint")} />
      <TextField control={form.control} name="description_en" label={label("description_en")} />
      {isNew ? (
        <SelectField
          control={form.control}
          name="unit"
          label={label("unit")}
          hint={label("unitHint")}
          options={[
            { value: "day", label: t("settingsTypes.unit.day") },
            { value: "hour", label: t("settingsTypes.unit.hour") },
          ]}
        />
      ) : (
        <p className="text-body text-text-secondary">{t("settingsTypes.unitFixed", { unit: t(`settingsTypes.unit.${values.unit}`) })}</p>
      )}
      {values.unit === "day" && <SwitchField control={form.control} name="allows_half_day" label={label("allows_half_day")} />}
      <SwitchField control={form.control} name="deducts" label={label("deducts")} />
      <SwitchField control={form.control} name="document_required" label={label("document_required")} />
      {values.document_required && (
        <TextField
          control={form.control}
          name="document_deadline_hours"
          label={label("document_deadline_hours")}
          hint={label("documentDeadlineHint")}
          optional
          inputMode="numeric"
        />
      )}
      <SwitchField control={form.control} name="allows_past_dates" label={label("allows_past_dates")} />
      <TextField control={form.control} name="notice_days" label={label("notice_days")} inputMode="numeric" />
      <SelectField
        control={form.control}
        name="cap_period"
        label={label("cap_period")}
        options={(["none", "week", "month"] as const).map((period) => ({
          value: period,
          label: t(`settingsTypes.capPeriod.${period}`),
        }))}
      />
      {values.cap_period !== "none" && (
        <TextField control={form.control} name="cap_quantity" label={label("cap_quantity")} inputMode="decimal" />
      )}
      <SwitchField control={form.control} name="reduces_meal_tickets" label={label("reduces_meal_tickets")} />
      <SelectField
        control={form.control}
        name="calendar_label"
        label={label("calendar_label")}
        options={(["absent", "remote", "hidden"] as const).map((value) => ({
          value,
          label: t(`settingsTypes.calendarLabel.${value}`),
        }))}
      />
      <SwitchField control={form.control} name="is_sensitive" label={label("is_sensitive")} />
      <SwitchField control={form.control} name="uses_events" label={label("uses_events")} />
      <SwitchField control={form.control} name="is_active" label={label("is_active")} />
      <TextField control={form.control} name="sort_order" label={label("sort_order")} inputMode="numeric" />
      {type && (
        <Link
          to={`/hr/settings/steps?type=${type.id}`}
          className="inline-flex min-h-11 items-center text-body font-medium text-primary underline underline-offset-2"
        >
          {t("settingsTypes.stepsLink")}
        </Link>
      )}
    </form>
  );
}

/** Every attribute of a type, to read. */
function TypeDetails({ type }: { type: RequestTypeOut }) {
  const { t, lang } = useRequestsText();
  const label = (name: string) => t(`settingsTypes.fields.${name}`);
  const yesNo = (value: boolean) => t(value ? "common.yes" : "common.no");
  const rows: [string, string][] = [
    [label("code"), type.code],
    [label("name_fr"), type.name_fr],
    [label("name_en"), type.name_en],
    [label("description_fr"), type.description_fr || "—"],
    [label("description_en"), type.description_en || "—"],
    [label("unit"), t(`settingsTypes.unit.${type.unit}`)],
    [label("allows_half_day"), yesNo(type.allows_half_day)],
    [label("deducts"), yesNo(type.balance_effect === "deducts_annual")],
    [t("settingsTypes.columns.document"), documentText(type, t)],
    [label("allows_past_dates"), yesNo(type.allows_past_dates)],
    [label("notice_days"), String(type.notice_days)],
    [t("settingsTypes.columns.limit"), limitText(type, t, lang)],
    [label("reduces_meal_tickets"), yesNo(type.reduces_meal_tickets)],
    [label("calendar_label"), t(`settingsTypes.calendarLabel.${type.calendar_label}`)],
    [label("is_sensitive"), yesNo(type.is_sensitive)],
    [label("uses_events"), yesNo(type.uses_events)],
    [label("is_active"), yesNo(type.is_active)],
    [label("sort_order"), String(type.sort_order)],
  ];
  return (
    <dl className="flex flex-col gap-3">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt className="text-caption text-muted-foreground">{name}</dt>
          <dd className="m-0 text-body">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Settings, request types (UI 7.12). With `readOnly`, a list and each type's attributes, and no action. */
export default function RequestTypesPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const [open, setOpen] = useState(false);
  // The type the sheet is about; null while the sheet is that of a new type.
  const [selected, setSelected] = useState<RequestTypeOut | null>(null);

  const show = (type: RequestTypeOut | null) => {
    setSelected(type);
    setOpen(true);
  };

  const columns: Column<RequestTypeOut>[] = [
    { key: "name", header: t("settingsTypes.columns.name"), cell: (type) => type.name },
    { key: "unit", header: t("settingsTypes.columns.unit"), cell: (type) => t(`settingsTypes.unit.${type.unit}`) },
    {
      key: "balance",
      header: t("settingsTypes.columns.balance"),
      cell: (type) => t(type.balance_effect === "deducts_annual" ? "common.yes" : "common.no"),
    },
    { key: "document", header: t("settingsTypes.columns.document"), cell: (type) => documentText(type, t) },
    { key: "limit", header: t("settingsTypes.columns.limit"), cell: (type) => limitText(type, t, lang) },
    {
      key: "state",
      header: t("settingsTypes.columns.state"),
      cell: (type) => (
        <StatusBadge tone={type.is_active ? "approved" : "neutral"}>
          {t(type.is_active ? "settingsForm.active" : "settingsForm.inactive")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsTypes.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsTypes.new")}
            </Button>
          )
        }
      />
      {!readOnly && <p className="mb-4 max-w-2xl text-body text-text-secondary">{t("settingsForm.appliesLater")}</p>}
      {/* An editable page opens its sheet over this list. */}
      <Gate query={types} form={!readOnly}>
        {(all) => (
          <DataTable
            label={t("settingsTypes.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.sort_order - b.sort_order)}
            rowKey={(type) => String(type.id)}
            onRowOpen={show}
            empty={<EmptyState title={t("settingsTypes.empty")} />}
          />
        )}
      </Gate>
      {readOnly ? (
        <TaskSheet open={open} onOpenChange={setOpen} title={selected?.name ?? ""}>
          {selected && <TypeDetails type={selected} />}
        </TaskSheet>
      ) : (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title={selected ? t("settingsTypes.sheetEdit", { name: selected.name }) : t("settingsTypes.sheetNew")}
          submitLabel={t("common.save")}
        >
          {(formId) => <TypeForm formId={formId} type={selected} onDone={() => setOpen(false)} />}
        </ActionSheet>
      )}
    </>
  );
}
