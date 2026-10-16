import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import type { Translate } from "./platform";

/**
 * Shows a failed call on a form: each problem on the input `resolve` names (U5), the first one focused.
 * Returns the problems that belong to no input, for the summary above the form.
 * A 409, an outage and an unexpected failure each become one plain sentence.
 */
export function serverProblems<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  t: Translate,
  resolve: (problem: FieldProblem) => Path<T> | null,
): FieldProblem[] {
  if (!(error instanceof ProblemError)) {
    return [{ field: null, code: "core.unexpected", detail: t("errors:unexpected"), params: {} }];
  }
  if (error.status === 409) {
    return [{ field: null, code: error.code, detail: t("common:concurrent"), params: {} }];
  }
  if (error.errors.length === 0) {
    // An outage or an answer that is not in the problem format: plan 01b's sentences.
    const key = error.status === 0 ? "errors:network" : error.unavailable ? "errors:unavailable" : "errors:unexpected";
    return [{ field: null, code: error.code, detail: error.detail || t(key), params: {} }];
  }
  const loose: FieldProblem[] = [];
  let focus = true;
  for (const problem of error.errors) {
    const field = resolve(problem);
    if (field === null) {
      loose.push(problem);
      continue;
    }
    form.setError(field, { type: `server:${problem.code}`, message: problem.detail }, { shouldFocus: focus });
    focus = false;
  }
  return loose;
}

/** The sentences of a list of problems, as `FormSummary` takes them. */
export function details(problems: FieldProblem[]): string[] {
  return problems.map((problem) => problem.detail);
}

/** A resolver for a form whose inputs carry the server's field names, with an optional table by problem code. */
export function byName<T extends FieldValues>(
  names: readonly Path<T>[],
  byCode: Record<string, Path<T>> = {},
): (problem: FieldProblem) => Path<T> | null {
  return (problem) => {
    if (problem.field && (names as readonly string[]).includes(problem.field)) return problem.field as Path<T>;
    return byCode[problem.code] ?? null;
  };
}
