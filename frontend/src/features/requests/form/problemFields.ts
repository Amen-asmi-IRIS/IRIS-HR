import type { FieldProblem } from "@/api/problem";

export const FORM_FIELDS = [
  "start_date",
  "end_date",
  "starts_at_midday",
  "ends_at_midday",
  "start_time",
  "end_time",
  "exceptional_event",
  "comment",
  "file",
  "override_reason",
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

const BY_CODE: Record<string, FormField> = {
  "request.end_before_start": "end_date",
  // One request covers at most 366 days (plan 03a, at review).
  "request.period_too_long": "end_date",
  "request.no_working_day": "start_date",
  "request.half_day_not_allowed": "starts_at_midday",
  "request.half_day_on_non_working_day": "starts_at_midday",
  "request.half_day_both_ends": "ends_at_midday",
  "request.dates_required": "start_date",
  "request.past_dates": "start_date",
  "request.notice": "start_date",
  "request.overlap": "start_date",
  "request.balance_insufficient": "end_date",
  "request.cap_exceeded": "start_date",
  "request.event_required": "exceptional_event",
  "request.event_days_exceeded": "end_date",
  "request.permission_non_working_day": "start_date",
  "request.permission_times": "end_time",
  "request.permission_overlaps_absence": "start_date",
  "request.reason_required": "override_reason",
  "files.too_large": "file",
  "files.type_not_allowed": "file",
  "files.content_mismatch": "file",
  "files.empty": "file",
};

const ALIASES: Record<string, FormField> = {
  exceptional_event_id: "exceptional_event",
  event: "exceptional_event",
  date: "start_date",
};

/** The input a problem is shown on, or null when it belongs to the summary above the form. */
export function fieldFor(problem: FieldProblem, visible: ReadonlySet<FormField>): FormField | null {
  let field: FormField | undefined;
  if (problem.field) {
    field = (FORM_FIELDS as readonly string[]).includes(problem.field)
      ? (problem.field as FormField)
      : ALIASES[problem.field];
  }
  field ??= BY_CODE[problem.code];
  return field && visible.has(field) ? field : null;
}
