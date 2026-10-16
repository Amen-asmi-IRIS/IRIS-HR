import { useId, type ComponentProps } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { describedBy, Field, type BoundFieldProps } from "./Field";

type InputProps = Omit<ComponentProps<"input">, "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "id">;

export function TextField<T extends FieldValues>({ control, name, label, hint, optional, ...input }: BoundFieldProps<T> & InputProps) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Input
        {...input}
        id={id}
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
