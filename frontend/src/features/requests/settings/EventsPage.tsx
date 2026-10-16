import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import {
  DataTable, EmptyState, FormSummary, PageHeader, StatusBadge, SwitchField, TextField, toast, type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays } from "@/lib/format";
import { useEvents, useSaveEvent } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { useRequestsText } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { ExceptionalEventOut } from "../types";

interface EventValues {
  name_fr: string;
  name_en: string;
  days_allowed: string;
  proof_required: boolean;
  is_active: boolean;
}

const NEW_EVENT: EventValues = { name_fr: "", name_en: "", days_allowed: "", proof_required: false, is_active: true };
const SHOWN: Path<EventValues>[] = ["name_fr", "name_en", "days_allowed"];
const BY_CODE: Record<string, Path<EventValues>> = { "request.event_days_invalid": "days_allowed" };

function EventForm({ formId, event, onDone }: { formId: string; event: ExceptionalEventOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveEvent();
  const form = useForm<EventValues>({
    defaultValues: event
      ? {
          name_fr: event.name_fr,
          name_en: event.name_en,
          days_allowed: String(Number(event.days_allowed)),
          proof_required: event.proof_required,
          is_active: event.is_active,
        }
      : NEW_EVENT,
  });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const label = (name: string) => t(`settingsEvents.fields.${name}`);

  const [submit] = useSingleFlight(async (values: EventValues) => {
    const days = values.days_allowed.trim().replace(",", ".");
    const nameFr = values.name_fr.trim();
    const nameEn = values.name_en.trim();
    if (nameFr === "") form.setError("name_fr", { type: "client", message: t("formErrors.required") });
    if (nameEn === "") form.setError("name_en", { type: "client", message: t("formErrors.required") });
    if (!(Number(days) > 0)) form.setError("days_allowed", { type: "client", message: t("settingsForm.positive") });
    if (nameFr === "" || nameEn === "" || !(Number(days) > 0)) return;
    try {
      await save.mutateAsync({
        id: event?.id ?? null,
        body: { name_fr: nameFr, name_en: nameEn, days_allowed: days, proof_required: values.proof_required, is_active: values.is_active },
      });
      toast(t("settingsEvents.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<EventValues>(SHOWN, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <TextField control={form.control} name="days_allowed" label={label("days_allowed")} inputMode="decimal" />
      <SwitchField control={form.control} name="proof_required" label={label("proof_required")} />
      <SwitchField control={form.control} name="is_active" label={label("is_active")} />
    </form>
  );
}

/** Settings, exceptional-leave events (UI 7.12). With `readOnly`, the list alone. */
export default function EventsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ExceptionalEventOut | null>(null);

  const show = (event: ExceptionalEventOut | null) => {
    setSelected(event);
    setOpen(true);
  };

  const columns: Column<ExceptionalEventOut>[] = [
    { key: "name", header: t("settingsEvents.columns.name"), cell: (event) => event.name },
    { key: "days", header: t("settingsEvents.columns.days"), cell: (event) => formatDays(event.days_allowed, lang) },
    {
      key: "proof",
      header: t("settingsEvents.columns.proof"),
      cell: (event) => t(event.proof_required ? "common.yes" : "common.no"),
    },
    {
      key: "state",
      header: t("settingsEvents.columns.state"),
      cell: (event) => (
        <StatusBadge tone={event.is_active ? "approved" : "neutral"}>
          {t(event.is_active ? "settingsForm.active" : "settingsForm.inactive")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsEvents.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsEvents.new")}
            </Button>
          )
        }
      />
      {/* An editable page opens its sheet over this list. */}
      <Gate query={events} form={!readOnly}>
        {(all) => (
          <DataTable
            label={t("settingsEvents.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.name.localeCompare(b.name, lang))}
            rowKey={(event) => String(event.id)}
            onRowOpen={readOnly ? undefined : show}
            empty={<EmptyState title={t("settingsEvents.empty")} />}
          />
        )}
      </Gate>
      {!readOnly && (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title={selected ? t("settingsEvents.sheetEdit", { name: selected.name }) : t("settingsEvents.sheetNew")}
          submitLabel={t("common.save")}
        >
          {(formId) => <EventForm formId={formId} event={selected} onDone={() => setOpen(false)} />}
        </ActionSheet>
      )}
    </>
  );
}
