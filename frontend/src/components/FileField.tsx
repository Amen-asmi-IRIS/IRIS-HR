import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useController, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { describedBy, Field, type BoundFieldProps } from "./Field";

/** One file. The value is the File, or null. The API accepts PDF, JPG and PNG. */
export function FileField<T extends FieldValues>({ control, name, label, hint, optional, accept = ".pdf,.jpg,.jpeg,.png" }: BoundFieldProps<T> & { accept?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  const file = field.value as File | null | undefined;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        type="file"
        accept={accept}
        name={field.name}
        ref={(element) => {
          input.current = element;
          field.ref(element);
        }}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.files?.[0] ?? null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="block w-full text-body text-text-secondary file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-input file:bg-secondary file:px-4 file:font-semibold file:text-secondary-foreground md:file:h-10"
      />
      {file && (
        <p className="flex items-center gap-3 text-caption text-muted-foreground">
          <span>{file.name}</span>
          <Button
            variant="link"
            size="inline"
            onClick={() => {
              if (input.current) input.current.value = "";
              field.onChange(null);
            }}
          >
            {t("form.fileRemove")}
          </Button>
        </p>
      )}
    </Field>
  );
}
