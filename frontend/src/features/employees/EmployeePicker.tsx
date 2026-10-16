import { useId } from "react";
import { useTranslation } from "react-i18next";

import { describedBy, Field } from "@/components";
import { NativeSelect } from "@/components/ui/native-select";

import { useEmployeeDirectory } from "./api";

interface EmployeePickerProps {
  label: string;
  /** The `public_id` of the chosen employee, or null. */
  value: string | null;
  onChange: (publicId: string | null) => void;
  /** People who must not be offered (the manager when choosing their delegate, the employee when choosing their manager). */
  exclude?: string[];
  error?: string;
  hint?: string;
  /** Offer "nobody" as a real choice, worded by `noneLabel`. */
  allowNone?: boolean;
  noneLabel?: string;
  /**
   * The person the value already names. The directory holds active people only, so someone who left or is
   * suspended would otherwise vanish from the choice and the select would show "nobody" for them.
   */
  current?: { public_id: string; name: string } | null;
}

/** One active employee, chosen from the directory. The browser's own select: it works everywhere and searches as you type. */
export function EmployeePicker({
  label,
  value,
  onChange,
  exclude = [],
  error,
  hint,
  allowNone = false,
  noneLabel,
  current,
}: EmployeePickerProps) {
  const { t } = useTranslation("employees");
  const id = useId();
  const directory = useEmployeeDirectory();
  const people = (directory.data ?? []).filter((person) => !exclude.includes(person.public_id));
  // Once the directory is read, a chosen person it does not list is no longer active.
  const inactive =
    current && directory.data && value === current.public_id && !people.some((person) => person.public_id === value)
      ? current
      : null;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <NativeSelect
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        <option value="">{allowNone ? (noneLabel ?? t("picker.none")) : t("picker.choose")}</option>
        {inactive ? <option value={inactive.public_id}>{t("picker.inactive", { name: inactive.name })}</option> : null}
        {people.map((person) => (
          <option key={person.public_id} value={person.public_id}>
            {person.name} · {person.department}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
