import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ProblemError } from "@/api/problem";
import { problemText } from "@/api/problemText";

interface Options {
  /** Renames a server field to a form field, or returns null to send the problem to the summary. */
  mapField?: (field: string) => string | null;
}

/**
 * Shows a failed submission: each problem next to the input of the same name, the rest above the form.
 * It never resets the form, so what the user typed stays (U5).
 */
export function useProblemForm<T extends FieldValues>(form: UseFormReturn<T>, options: Options = {}) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<string[]>([]);
  const { mapField } = options;

  const onError = useCallback(
    (error: unknown) => {
      const general: string[] = [];
      let first: string | null = null;
      if (error instanceof ProblemError && error.errors.length > 0) {
        const values = form.getValues();
        for (const problem of error.errors) {
          const named = problem.field === null ? null : mapField ? mapField(problem.field) : problem.field;
          // The API names one entry of a list by its position ("roles.0"): the input is the list itself.
          const head = named === null ? null : named.split(".")[0];
          const target = named !== null && named in values ? named : head !== null && head in values ? head : null;
          if (target !== null) {
            form.setError(target as Path<T>, { type: "server", message: problem.detail });
            first ??= target;
          } else {
            general.push(problem.detail || problemText(error, t));
          }
        }
      } else {
        general.push(problemText(error, t));
      }
      setSummary(general);
      if (first !== null) {
        try {
          form.setFocus(first as Path<T>);
        } catch {
          // The input cannot take focus (a file input, a switch): its error is still shown next to it.
        }
      }
    },
    [form, mapField, t],
  );

  const clear = useCallback(() => setSummary([]), []);

  return { onError, summary, clear };
}
