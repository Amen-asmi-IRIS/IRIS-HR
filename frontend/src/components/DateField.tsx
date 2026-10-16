import type { FieldValues } from "react-hook-form";
import type { BoundFieldProps } from "./Field";
import { TextField } from "./TextField";

/** A calendar date as YYYY-MM-DD, entered with the browser's own date control. */
export function DateField<T extends FieldValues>(props: BoundFieldProps<T> & { min?: string; max?: string }) {
  return <TextField {...props} type="date" />;
}
