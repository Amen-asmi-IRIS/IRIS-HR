import type { FieldValues } from "react-hook-form";
import type { BoundFieldProps } from "./Field";
import { TextField } from "./TextField";

/** A time as HH:MM, in quarter-hour steps. */
export function TimeField<T extends FieldValues>(props: BoundFieldProps<T>) {
  return <TextField {...props} type="time" step={900} />;
}
