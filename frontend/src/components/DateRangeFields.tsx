import { useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { DateField } from "./DateField";

interface DateRangeFieldsProps<T extends FieldValues> {
  control: Control<T>;
  startName: FieldPath<T>;
  endName: FieldPath<T>;
  startLabel: string;
  endLabel: string;
}

/** Two dates side by side; the end cannot be picked before the start. */
export function DateRangeFields<T extends FieldValues>({ control, startName, endName, startLabel, endLabel }: DateRangeFieldsProps<T>) {
  const start = useWatch({ control, name: startName }) as string | undefined;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DateField control={control} name={startName} label={startLabel} />
      <DateField control={control} name={endName} label={endLabel} min={start || undefined} />
    </div>
  );
}
