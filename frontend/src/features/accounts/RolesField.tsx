import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useController, type Control } from "react-hook-form";
import { ASSIGNABLE_ROLES, type AssignableRole, type CreateAccountValues } from "./createAccountForm";

/** The three roles a System Administrator gives, as checkboxes. */
export function RolesField({ control }: { control: Control<CreateAccountValues> }) {
  const { t } = useTranslation();
  const id = useId();
  const { field, fieldState } = useController({ control, name: "roles" });
  const selected = field.value;
  const error = fieldState.error?.message;

  const toggle = (role: AssignableRole, checked: boolean) => {
    field.onChange(checked ? [...selected, role] : selected.filter((entry) => entry !== role));
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}>
      <legend className="mb-1 p-0 text-body font-medium text-foreground">{t("accounts:create.roles")}</legend>
      {ASSIGNABLE_ROLES.map((role) => (
        <label key={role} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-foreground md:min-h-8">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.includes(role)} onChange={(event) => toggle(role, event.target.checked)} />
          {t(`roles.${role}`)}
        </label>
      ))}
      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        {t("accounts:create.rolesHint")}
      </p>
      {error && (
        <p id={`${id}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </fieldset>
  );
}
