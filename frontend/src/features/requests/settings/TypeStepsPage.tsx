import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router";
import type { FieldProblem } from "@/api/problem";
import { EmptyState, FilterSelect, FormSummary, PageHeader, SelectField, TextField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { useChainPreview, useRequestTypes, useSaveTypeSteps, useTypeSteps } from "../api";
import { chainSentence } from "../form/chain";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { joined } from "../text";
import { useRequestsText } from "../platform";
import { details, serverProblems } from "../problems";
import type { ApproverRule, ChainStepInput, ChainStepOut, RequestTypeOut, StepMode } from "../types";

/** A step as the editor holds it: delays as text, the named person as a `public_id` or "". */
interface StepDraft {
  approver_rule: ApproverRule;
  named_person: string;
  mode: StepMode;
  reminder_after_days: string;
  flag_after_days: string;
}

interface StepsValues {
  steps: StepDraft[];
}

const RULES: ApproverRule[] = ["line_manager", "hr_role", "named_person"];
const MODES: StepMode[] = ["approve", "notify"];
const NEW_STEP: StepDraft = { approver_rule: "hr_role", named_person: "", mode: "approve", reminder_after_days: "2", flag_after_days: "4" };

const toDraft = (step: ChainStepOut): StepDraft => ({
  approver_rule: step.approver_rule,
  named_person: step.named_person?.public_id ?? "",
  mode: step.mode,
  reminder_after_days: String(step.reminder_after_days),
  flag_after_days: step.flag_after_days === null ? "" : String(step.flag_after_days),
});

/** HR is reminded but never alerted about itself; a step that only informs waits for nobody. */
const hasFlag = (step: StepDraft) => step.mode === "approve" && step.approver_rule !== "hr_role";

function toInput(step: StepDraft): ChainStepInput {
  const deciding = step.mode === "approve";
  return {
    approver_rule: step.approver_rule,
    named_person: step.approver_rule === "named_person" ? step.named_person : null,
    mode: step.mode,
    reminder_after_days: deciding ? Number(step.reminder_after_days) : 2,
    flag_after_days: hasFlag(step) && step.flag_after_days.trim() !== "" ? Number(step.flag_after_days) : null,
  };
}

const isDelay = (text: string) => /^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 60;

function StepsEditor({ type, saved }: { type: RequestTypeOut; saved: ChainStepOut[] }) {
  const { t } = useRequestsText();
  const save = useSaveTypeSteps();
  const form = useForm<StepsValues>({ defaultValues: { steps: saved.map(toDraft) } });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "steps" });
  const steps = (useWatch({ control: form.control, name: "steps" }) ?? []) as StepDraft[];
  const [problems, setProblems] = useState<string[]>([]);
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const preview = useChainPreview(type.id, previewFor);

  const [submit] = useSingleFlight(async (values: StepsValues) => {
    let wrong = false;
    values.steps.forEach((step, index) => {
      if (step.approver_rule === "named_person" && step.named_person === "") {
        form.setError(`steps.${index}.named_person`, { type: "client", message: t("settingsSteps.personRequired") });
        wrong = true;
      }
      if (step.mode === "approve" && !isDelay(step.reminder_after_days)) {
        form.setError(`steps.${index}.reminder_after_days`, { type: "client", message: t("settingsSteps.delayInvalid") });
        wrong = true;
      }
      if (hasFlag(step) && step.flag_after_days.trim() !== "" && !isDelay(step.flag_after_days)) {
        form.setError(`steps.${index}.flag_after_days`, { type: "client", message: t("settingsSteps.delayInvalid") });
        wrong = true;
      }
    });
    const decides = values.steps.some((step) => step.mode === "approve");
    setProblems(decides ? [] : [t("settingsSteps.needsDecider")]);
    setLoose([]);
    if (wrong || !decides) return;
    try {
      await save.mutateAsync({ typeId: type.id, steps: values.steps.map(toInput) });
      toast(t("settingsSteps.saved"));
    } catch (error) {
      // The API reports a problem of the steps as a whole: it is shown above them.
      setLoose(serverProblems(form, error, t, () => null));
    }
  });

  return (
    <>
      <p className="mb-4 max-w-2xl text-body text-text-secondary">{t("settingsForm.appliesLater")}</p>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-4">
        <FormSummary problems={[...problems, ...details(loose)]} />
        {fields.length === 0 && <p className="text-body text-muted-foreground">{t("settingsSteps.none")}</p>}
        {fields.map((field, index) => {
          const current = steps[index] ?? NEW_STEP;
          return (
            <fieldset key={field.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-5">
              <legend className="px-1 text-section font-semibold">{t("settingsSteps.step", { n: index + 1 })}</legend>
              <SelectField
                control={form.control}
                name={`steps.${index}.approver_rule`}
                label={t("settingsSteps.who")}
                options={RULES.map((rule) => ({ value: rule, label: t(`settingsSteps.rule.${rule}`) }))}
              />
              {current.approver_rule === "named_person" && (
                <Controller
                  control={form.control}
                  name={`steps.${index}.named_person`}
                  render={({ field: person, fieldState }) => (
                    <EmployeePicker
                      label={t("settingsSteps.person")}
                      value={person.value === "" ? null : person.value}
                      onChange={(publicId) => person.onChange(publicId ?? "")}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              )}
              <SelectField
                control={form.control}
                name={`steps.${index}.mode`}
                label={t("settingsSteps.role")}
                options={MODES.map((mode) => ({ value: mode, label: t(`settingsSteps.mode.${mode}`) }))}
              />
              {current.mode === "approve" && (
                <TextField
                  control={form.control}
                  name={`steps.${index}.reminder_after_days`}
                  label={t("settingsSteps.reminder")}
                  inputMode="numeric"
                />
              )}
              {hasFlag(current) && (
                <TextField
                  control={form.control}
                  name={`steps.${index}.flag_after_days`}
                  label={t("settingsSteps.flag")}
                  hint={t("settingsSteps.flagHint")}
                  optional
                  inputMode="numeric"
                />
              )}
              <div className="flex flex-wrap gap-1">
                {index > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => move(index, index - 1)}>
                    {t("settingsSteps.up")}
                  </Button>
                )}
                {index < fields.length - 1 && (
                  <Button variant="ghost" size="sm" onClick={() => move(index, index + 1)}>
                    {t("settingsSteps.down")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                  {t("settingsSteps.remove")}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            {t("settingsSteps.save")}
          </Button>
          <Button variant="secondary" onClick={() => append({ ...NEW_STEP })}>
            {t("settingsSteps.add")}
          </Button>
        </div>
      </form>

      <section className="mt-8 max-w-2xl">
        <EmployeePicker
          label={t("settingsSteps.preview")}
          hint={t("settingsSteps.previewHint")}
          value={previewFor}
          onChange={setPreviewFor}
          allowNone
        />
        {previewFor !== null && (
          <Gate query={preview} form>{(chain) => <p className="mt-3 text-body font-medium">{chainSentence(chain, t, "hr")}</p>}</Gate>
        )}
      </section>
    </>
  );
}

function StepsRead({ saved }: { saved: ChainStepOut[] }) {
  const { t } = useRequestsText();
  if (saved.length === 0) return <p className="text-body text-muted-foreground">{t("settingsSteps.none")}</p>;
  return (
    <ol aria-label={t("settingsSteps.title")} className="flex max-w-2xl flex-col gap-3">
      {saved.map((step) => {
        const who =
          step.approver_rule === "named_person" && step.named_person
            ? step.named_person.name
            : t(`settingsSteps.rule.${step.approver_rule}`);
        const delays = [
          t("settingsSteps.readReminder", { reminder: step.reminder_after_days }),
          ...(step.flag_after_days === null ? [] : [t("settingsSteps.readFlag", { flag: step.flag_after_days })]),
        ].join(", ");
        return (
          <li key={step.id} className="rounded-xl border border-border bg-card px-6 py-4 text-body">
            <p className="font-medium">{joined(who, t(`settingsSteps.mode.${step.mode}`))}</p>
            {step.mode === "approve" && <p className="text-text-secondary">{delays}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function StepsOfType({ type, readOnly }: { type: RequestTypeOut; readOnly: boolean }) {
  const steps = useTypeSteps(type.id);
  return (
    // The editor is a form over this reading.
    <Gate query={steps} form={!readOnly}>
      {(saved) => {
        const ordered = [...saved].sort((a, b) => a.position - b.position);
        return readOnly ? <StepsRead saved={ordered} /> : <StepsEditor type={type} saved={ordered} />;
      }}
    </Gate>
  );
}

/** Settings, steps of a type (UI 7.12). `?type=<id>` names the type; the first one otherwise. */
export default function TypeStepsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const types = useRequestTypes();

  return (
    <>
      <PageHeader title={t("settingsSteps.title")} back={readOnly ? undefined : "/hr/settings"} />
      <Gate query={types} form={!readOnly}>
        {(all) => {
          const sorted = [...all].sort((a, b) => a.sort_order - b.sort_order);
          const type = sorted.find((item) => String(item.id) === search.get("type")) ?? sorted[0];
          if (!type) return <EmptyState title={t("settingsTypes.empty")} />;
          return (
            <>
              <div className="mb-4">
                <FilterSelect
                  label={t("settingsSteps.type")}
                  value={String(type.id)}
                  onChange={(value) => setSearch({ type: value })}
                  options={sorted.map((item) => ({ value: String(item.id), label: item.name }))}
                />
              </div>
              {/* The key gives each type its own editor: nothing typed for one type follows to another. */}
              <StepsOfType key={type.id} type={type} readOnly={readOnly} />
            </>
          );
        }}
      </Gate>
    </>
  );
}
