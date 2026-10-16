import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BoundFieldProps } from "./Field";

export function SwitchField<T extends FieldValues>({ control, name, label, hint }: BoundFieldProps<T>) {
  const id = useId();
  const { field } = useController({ control, name });
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="text-caption text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        ref={field.ref}
        checked={Boolean(field.value)}
        onCheckedChange={field.onChange}
        onBlur={field.onBlur}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}
