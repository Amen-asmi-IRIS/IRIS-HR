import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, Field, type BoundFieldProps } from "./Field";

export function TextAreaField<T extends FieldValues>({ control, name, label, hint, optional, rows = 3 }: BoundFieldProps<T> & { rows?: number }) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Textarea
        id={id}
        rows={rows}
        name={field.name}
        ref={field.ref}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Field>
  );
}
