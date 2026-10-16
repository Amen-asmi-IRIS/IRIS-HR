import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import {
  ConfirmDialog, DataTable, DateField, EmptyState, FilterSelect, FormSummary, PageHeader, SwitchField, TextField, toast,
  type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { formatDate, formatDateRange } from "@/lib/format";
import { useCopyHolidays, useDeleteHoliday, useHolidayImpact, useHolidays, useSaveHoliday } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { joined } from "../text";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { HolidayOut } from "../types";

interface HolidayValues {
  date: string;
  name_fr: string;
  name_en: string;
  recurs_yearly: boolean;
}

const NEW_HOLIDAY: HolidayValues = { date: "", name_fr: "", name_en: "", recurs_yearly: false };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const failure = (error: unknown, t: Translate) =>
  error instanceof ProblemError && error.detail ? error.detail : t("errors:unexpected");

/**
 * The approved requests that cover a day about to become, or to stop being, a public holiday.
 * They are reported, not recalculated: a request already sent keeps its count (master D22).
 */
function Impact({ date, title }: { date: string; title: string }) {
  const { lang } = useRequestsText();
  const impact = useHolidayImpact(ISO_DATE.test(date) ? date : "");
  const rows = impact.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div role="status" className="rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {rows.map((row) => (
          <li key={row.public_id}>{joined(row.employee, row.type, formatDateRange(row.start_date, row.end_date, lang))}</li>
        ))}
      </ul>
    </div>
  );
}

function HolidayForm({ formId, holiday, onDone }: { formId: string; holiday: HolidayOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveHoliday();
  const form = useForm<HolidayValues>({
    defaultValues: holiday
      ? { date: holiday.date, name_fr: holiday.name_fr, name_en: holiday.name_en, recurs_yearly: holiday.recurs_yearly }
      : NEW_HOLIDAY,
  });
  const date = useWatch({ control: form.control, name: "date" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const label = (name: string) => t(`settingsHolidays.fields.${name}`);
  const moved = holiday !== null && date !== holiday.date;

  const [submit] = useSingleFlight(async (values: HolidayValues) => {
    const nameFr = values.name_fr.trim();
    const nameEn = values.name_en.trim();
    const required = t("formErrors.required");
    if (!ISO_DATE.test(values.date)) form.setError("date", { type: "client", message: required });
    if (nameFr === "") form.setError("name_fr", { type: "client", message: required });
    if (nameEn === "") form.setError("name_en", { type: "client", message: required });
    if (!ISO_DATE.test(values.date) || nameFr === "" || nameEn === "") return;
    try {
      await save.mutateAsync({
        id: holiday?.id ?? null,
        body: { date: values.date, name_fr: nameFr, name_en: nameEn, recurs_yearly: values.recurs_yearly },
      });
      toast(t("settingsHolidays.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<HolidayValues>(["date", "name_fr", "name_en"])));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      <DateField control={form.control} name="date" label={label("date")} />
      {(holiday === null || moved) && <Impact date={date} title={t("settingsHolidays.impactNew")} />}
      {moved && holiday && <Impact date={holiday.date} title={t("settingsHolidays.impactOld")} />}
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <SwitchField control={form.control} name="recurs_yearly" label={label("recurs_yearly")} />
    </form>
  );
}

/** Settings, public holidays by year (UI 7.12). `?year=` names the year; the current one otherwise. */
export default function HolidaysPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const thisYear = Number(todayISO().slice(0, 4));
  const asked = Number(search.get("year"));
  const year = Number.isInteger(asked) && asked >= 1900 && asked <= 2200 ? asked : thisYear;
  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, thisYear + 2, year])].sort((a, b) => a - b);

  const holidays = useHolidays(year);
  const remove = useDeleteHoliday();
  const copy = useCopyHolidays();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HolidayOut | null>(null);
  // The holiday being removed, while its confirmation is open.
  const [doomed, setDoomed] = useState<HolidayOut | null>(null);
  const doomedImpact = useHolidayImpact(doomed?.date ?? "");

  const show = (holiday: HolidayOut | null) => {
    setSelected(holiday);
    setOpen(true);
  };

  const [copyNext] = useSingleFlight(async () => {
    try {
      const created = await copy.mutateAsync({ fromYear: year, toYear: year + 1 });
      toast(t("settingsHolidays.copied", { year: year + 1, n: created.length }));
    } catch (error) {
      toast(failure(error, t));
    }
  });

  const [confirmRemoval] = useSingleFlight(async (holiday: HolidayOut) => {
    try {
      await remove.mutateAsync(holiday.id);
      toast(t("settingsHolidays.deleted"));
    } catch (error) {
      toast(failure(error, t));
    } finally {
      setDoomed(null);
    }
  });

  const affected = (doomedImpact.data ?? []).map((row) => row.employee);
  const consequence = doomed
    ? [
        t("settingsHolidays.deleteConsequence", { date: formatDate(doomed.date, lang) }),
        ...(affected.length > 0 ? [t("settingsHolidays.deleteImpact", { people: [...new Set(affected)].join(", ") })] : []),
      ].join(" ")
    : "";

  const columns: Column<HolidayOut>[] = [
    { key: "date", header: t("settingsHolidays.columns.date"), cell: (holiday) => formatDate(holiday.date, lang) },
    { key: "name", header: t("settingsHolidays.columns.name"), cell: (holiday) => holiday.name },
    {
      key: "recurs",
      header: t("settingsHolidays.columns.recurs"),
      cell: (holiday) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t(holiday.recurs_yearly ? "settingsHolidays.everyYear" : "settingsHolidays.thisYearOnly")}</span>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={() => setDoomed(holiday)}>
              {t("settingsHolidays.delete")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsHolidays.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsHolidays.new")}
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterSelect
          label={t("settingsHolidays.year")}
          value={String(year)}
          onChange={(value) => setSearch({ year: value })}
          options={years.map((value) => ({ value: String(value), label: String(value) }))}
        />
        {!readOnly && (
          <Button variant="secondary" onClick={() => void copyNext()}>
            {t("settingsHolidays.copy", { year: year + 1 })}
          </Button>
        )}
      </div>
      {/* An editable page opens its sheet over this list. */}
      <Gate query={holidays} form={!readOnly}>
        {(all) => (
          <DataTable
            label={t("settingsHolidays.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.date.localeCompare(b.date))}
            rowKey={(holiday) => String(holiday.id)}
            onRowOpen={readOnly ? undefined : show}
            empty={<EmptyState title={t("settingsHolidays.empty", { year })} />}
          />
        )}
      </Gate>
      {!readOnly && (
        <>
          <ActionSheet
            open={open}
            onOpenChange={setOpen}
            title={selected ? t("settingsHolidays.sheetEdit", { name: selected.name }) : t("settingsHolidays.sheetNew")}
            submitLabel={t("common.save")}
          >
            {(formId) => <HolidayForm formId={formId} holiday={selected} onDone={() => setOpen(false)} />}
          </ActionSheet>
          <ConfirmDialog
            open={doomed !== null}
            onOpenChange={(next) => {
              if (!next) setDoomed(null);
            }}
            title={t("settingsHolidays.deleteTitle")}
            consequence={consequence}
            confirmLabel={t("settingsHolidays.deleteConfirm")}
            destructive
            onConfirm={() => {
              if (doomed) void confirmRemoval(doomed);
            }}
          />
        </>
      )}
    </>
  );
}
