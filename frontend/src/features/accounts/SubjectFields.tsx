import { useId } from "react";
import { type Control, useController, useFormState } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { describedBy, Field, TextField } from "@/components";
import { NativeSelect } from "@/components/ui/native-select";

import { useAccountCandidates } from "./candidates";
import type { CreateAccountValues } from "./createAccountForm";

/**
 * Who the account is for. It draws the inputs, and shows the errors, of `employee`, `full_name` and `email`.
 * An employee without an account is chosen from the list: the name and the address then come from the
 * record. "None" keeps the name and email inputs, for an account that has no employee record.
 */
export function SubjectFields({ control }: { control: Control<CreateAccountValues> }) {
  const { t } = useTranslation();
  const id = useId();
  const candidates = useAccountCandidates();
  const { field, fieldState } = useController({ control, name: "employee" });
  const { errors } = useFormState({ control, name: ["full_name", "email"] });

  const people = candidates.data ?? [];
  const chosen = people.find((person) => person.public_id === field.value) ?? null;
  const offered = people.length > 0 || field.value !== null;
  const error = fieldState.error?.message;
  const hint = chosen ? t("employees:accountFor.hint", { email: chosen.email }) : undefined;
  // With an employee chosen the name and email inputs are not drawn: their errors are shown here.
  const hidden = field.value ? [errors.full_name?.message, errors.email?.message].filter(Boolean) : [];

  return (
    <>
      {offered ? (
        <Field label={t("employees:accountFor.employee")} htmlFor={id} error={error} hint={hint}>
          <NativeSelect
            id={id}
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onChange={(event) => field.onChange(event.target.value || null)}
            onBlur={field.onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
          >
            <option value="">{t("employees:accountFor.none")}</option>
            {people.map((person) => (
              <option key={person.public_id} value={person.public_id}>
                {person.full_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {field.value ? null : (
        <>
          <TextField control={control} name="full_name" label={t("accounts:create.fullName")} autoComplete="off" />
          <TextField
            control={control}
            name="email"
            label={t("accounts:create.email")}
            type="email"
            inputMode="email"
            autoComplete="off"
          />
        </>
      )}

      {!offered && error ? (
        <p role="alert" className="text-caption font-medium text-refused">
          {error}
        </p>
      ) : null}
      {hidden.map((message) => (
        <p key={message} role="alert" className="text-caption font-medium text-refused">
          {message}
        </p>
      ))}
    </>
  );
}
