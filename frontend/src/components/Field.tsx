import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";

/** What every input bound to react-hook-form takes. */
export interface BoundFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  optional?: boolean;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}

/** The ids an input lists in aria-describedby so that its hint and its error are read with it. */
export function describedBy(id: string, hint: string | undefined, error: string | undefined): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/** A labelled input with its hint and, next to it, its error (U5). */
export function Field({ label, htmlFor, error, hint, optional = false, children }: FieldProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {optional ? `${label} (${t("form.optional")})` : label}
      </Label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </div>
  );
}
