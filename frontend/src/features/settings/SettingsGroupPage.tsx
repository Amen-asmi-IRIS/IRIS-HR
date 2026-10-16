import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { awayWithData } from "@/api/problem";
import { problemText } from "@/api/problemText";
import type { Setting } from "@/api/types";
import { describedBy, Field } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { settingKeys, useSaveSetting, useSettings, type SettingsGroup } from "./api";
import { displayValue, fromField, sameValue, toField, type FieldValue } from "./settingValues";

type Values = Record<string, FieldValue>;

const NONE: Setting[] = [];
const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"];

interface ControlProps {
  setting: Setting;
  label: string;
  hint?: string;
  error?: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  onBlur: () => void;
}

/** Several choices ticked at once: the days of the week, or the values the setting allows. */
function Choices({ label, hint, error, value, onChange, options }: ControlProps & { options: { value: string; label: string }[] }) {
  const id = useId();
  const chosen = Array.isArray(value) ? value : [];
  const toggle = (option: string, checked: boolean) => {
    const next = checked ? [...chosen, option] : chosen.filter((entry) => entry !== option);
    onChange(options.map((entry) => entry.value).filter((entry) => next.includes(entry)));
  };
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" aria-describedby={describedBy(id, hint, error)}>
      <legend className="mb-1 p-0 text-body font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-x-6">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-foreground md:min-h-8">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={chosen.includes(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** One control per kind of setting (master 6.7). */
function SettingControl(props: ControlProps) {
  const { setting, label, hint, error, value, onChange, onBlur } = props;
  const { t } = useTranslation();
  const id = useId();

  if (setting.kind === "bool") {
    return (
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label htmlFor={id}>{label}</Label>
          {hint && (
            <p id={`${id}-hint`} className="text-caption text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={onChange} onBlur={onBlur} aria-describedby={hint ? `${id}-hint` : undefined} />
      </div>
    );
  }
  if (setting.kind === "weekdays") {
    return <Choices {...props} options={WEEKDAYS.map((day) => ({ value: day, label: t(`weekdays.${day}`) }))} />;
  }
  if (setting.kind === "str_list" && setting.choices) {
    return <Choices {...props} options={setting.choices.map((choice) => ({ value: choice, label: choice.toUpperCase() }))} />;
  }
  const numeric = setting.kind === "int" || setting.kind === "int_or_null" || setting.kind === "decimal";
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input
        id={id}
        type={setting.kind === "date_or_null" ? "date" : "text"}
        inputMode={setting.kind === "decimal" ? "decimal" : numeric ? "numeric" : undefined}
        className={numeric ? "tabular md:w-40" : setting.kind === "date_or_null" ? "md:w-56" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Field>
  );
}

/**
 * The settings of one group (ADM-05, ADM-06): whatever the API returns for it, one control per kind.
 * "Save" exists only while something differs from what is stored.
 */
export default function SettingsGroupPage({ group, readOnly = false }: { group: SettingsGroup; readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const queryClient = useQueryClient();
  const settings = useSettings(group);
  const save = useSaveSetting(group);
  const rows = settings.data ?? NONE;

  const storedValues = useMemo<Values>(() => Object.fromEntries(rows.map((setting) => [setting.key, toField(setting)])), [rows]);
  // After a save the group is read again: untouched controls take the stored value, typed ones keep what was typed.
  const form = useForm<Values>({ values: storedValues, resetOptions: { keepDirtyValues: true, keepErrors: true } });
  const held = useWatch({ control: form.control });
  const sending = form.formState.isSubmitting;

  const title = t(`settings:title.${group}`);
  if (settings.isPending) {
    return (
      <>
        <PageHeader title={title} />
        <PageLoading />
      </>
    );
  }
  // The group is read again after a save. If the application is away by then, the form stays, with what was typed.
  if (settings.error && !awayWithData(settings)) throw settings.error;

  const text = (key: string, fallback?: string) => (i18n.exists(key) ? t(key) : fallback);
  const hintOf = (setting: Setting) => {
    const parts = [text(`settings:${setting.key}.hint`)];
    if (setting.minimum !== null && setting.maximum !== null && setting.minimum !== undefined && setting.maximum !== undefined) {
      parts.push(t("settings:range", { min: String(setting.minimum), max: String(setting.maximum) }));
    }
    return parts.filter(Boolean).join(" ") || undefined;
  };
  const changeOf = (setting: Setting) => {
    if (!setting.updated_at) return t("settings:neverChanged");
    const when = formatDateTime(setting.updated_at, lang);
    return setting.updated_by ? t("settings:changedBy", { by: setting.updated_by, when }) : t("settings:changedOn", { when });
  };
  const messageOf = (error: "whole" | "number" | "range" | "weekdays" | "list" | "date", setting: Setting) =>
    t(`settings:errors.${error}`, { min: String(setting.minimum), max: String(setting.maximum) });

  if (readOnly) {
    return (
      <>
        <PageHeader title={title} />
        <dl className="flex max-w-2xl flex-col">
          {rows.map((setting) => (
            <div key={setting.key} className="border-t border-divider py-4">
              <dt className="text-body font-medium text-foreground">{text(`settings:${setting.key}.label`, setting.key)}</dt>
              <dd className="m-0 mt-1 text-body text-foreground">{displayValue(setting, t, lang)}</dd>
              <dd className="m-0 mt-1 text-caption text-muted-foreground">{changeOf(setting)}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  }

  const changed = rows.filter((setting) => held[setting.key] !== undefined && !sameValue(held[setting.key] as FieldValue, storedValues[setting.key]));

  const submit = form.handleSubmit(async (values) => {
    let failed = false;
    for (const setting of changed) {
      const parsed = fromField(setting, values[setting.key]);
      if (!parsed.ok) {
        form.setError(setting.key, { type: "validate", message: messageOf(parsed.error, setting) });
        failed = true;
        continue;
      }
      try {
        await save.mutateAsync({ key: setting.key, value: parsed.value });
      } catch (error) {
        form.setError(setting.key, { type: "server", message: problemText(error, t) });
        failed = true;
      }
    }
    await queryClient.invalidateQueries({ queryKey: settingKeys.group(group) });
    if (!failed) toast(t("saved"));
  });

  return (
    <>
      <PageHeader title={title} />
      <form
        noValidate
        className="max-w-2xl"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <ul className="flex flex-col">
          {rows.map((setting) => (
            <li key={setting.key} className="flex flex-col gap-1 border-t border-divider py-4">
              <Controller
                control={form.control}
                name={setting.key}
                render={({ field, fieldState }) => (
                  <SettingControl
                    setting={setting}
                    label={text(`settings:${setting.key}.label`, setting.key) ?? setting.key}
                    hint={hintOf(setting)}
                    error={fieldState.error?.message}
                    value={(field.value as FieldValue | undefined) ?? toField(setting)}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <p className="text-caption text-muted-foreground">{changeOf(setting)}</p>
            </li>
          ))}
        </ul>
        {changed.length > 0 && (
          <div className="sticky bottom-20 mt-4 md:bottom-4">
            <Button type="submit" variant="primary" aria-busy={sending}>
              {t("settings:save")}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
