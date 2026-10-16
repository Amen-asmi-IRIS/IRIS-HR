import { useFormState, type Control, type FieldPath, type FieldValues } from "react-hook-form";

interface FieldErrorProps<T extends FieldValues> {
  control: Control<T>;
  /** A top-level field of the form. */
  name: FieldPath<T>;
}

/**
 * The error of an input that does not show its own. Plan 01b's `SwitchField` has no error line,
 * so a problem with a switch is shown by this, next to it (U5).
 */
export function FieldError<T extends FieldValues>({ control, name }: FieldErrorProps<T>) {
  const { errors } = useFormState({ control, name });
  const message = (errors as unknown as Record<string, { message?: unknown } | undefined>)[name]?.message;
  if (typeof message !== "string" || message === "") return null;
  return <p className="text-caption font-medium text-refused">{message}</p>;
}
