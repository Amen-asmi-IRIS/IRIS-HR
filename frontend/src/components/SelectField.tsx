import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { NativeSelect } from "@/components/ui/native-select";
import { describedBy, Field, type BoundFieldProps } from "./Field";

interface SelectFieldExtras {
  options: { value: string; label: string }[];
  /** Text of the empty first choice. Leave out when a value is always selected. */
  placeholder?: string;
}

export function SelectField<T extends FieldValues>({ control, name, label, hint, optional, options, placeholder }: BoundFieldProps<T> & SelectFieldExtras) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <NativeSelect
        id={id}
        name={field.name}
        ref={field.ref}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
