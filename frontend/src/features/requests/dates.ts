import type { Translate } from "./platform";
import type { RequestOut } from "./types";

/** The dates of a request as a form edits them: in an amendment by its owner, in a correction by HR. */
export interface DateValues {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string;
  end_time: string;
}

/** The date input a server problem belongs to, by its code, when the server names no input. */
export const DATE_FIELD_BY_CODE: Record<string, keyof DateValues> = {
  "request.end_before_start": "end_date",
  "request.period_too_long": "end_date",
  "request.no_working_day": "start_date",
  "request.overlap": "start_date",
  "request.past_dates": "start_date",
  "request.notice": "start_date",
  "request.balance_insufficient": "end_date",
  "request.cap_exceeded": "start_date",
  "request.event_days_exceeded": "end_date",
  "request.permission_times": "end_time",
  "request.permission_non_working_day": "start_date",
  "request.permission_overlaps_absence": "start_date",
  "request.half_day_on_non_working_day": "starts_at_midday",
  "request.half_day_both_ends": "ends_at_midday",
  "request.dates_required": "start_date",
  "request.nothing_to_change": "start_date",
};

/** "14:00:00" -> "14:00"; null -> "". */
export const hhmm = (time: string | null) => (time ?? "").slice(0, 5);

export function currentDates(request: RequestOut): DateValues {
  return {
    start_date: request.start_date,
    end_date: request.end_date,
    starts_at_midday: request.starts_at_midday,
    ends_at_midday: request.ends_at_midday,
    start_time: hhmm(request.start_time),
    end_time: hhmm(request.end_time),
  };
}

export function sameAsCurrent(values: DateValues, request: RequestOut): boolean {
  if (request.type.unit === "hour") {
    return (
      values.start_date === request.start_date &&
      values.start_time === hhmm(request.start_time) &&
      values.end_time === hhmm(request.end_time)
    );
  }
  return (
    values.start_date === request.start_date &&
    values.end_date === request.end_date &&
    values.starts_at_midday === request.starts_at_midday &&
    values.ends_at_midday === request.ends_at_midday
  );
}

/** The dates as the API takes them; a permission has one date and two times. */
export function datesOf(values: DateValues, hourly: boolean) {
  return {
    start_date: values.start_date,
    end_date: hourly ? values.start_date : values.end_date,
    starts_at_midday: !hourly && values.starts_at_midday,
    ends_at_midday: !hourly && values.ends_at_midday,
    start_time: hourly ? values.start_time : null,
    end_time: hourly ? values.end_time : null,
  };
}

/** Whether the dates are coherent enough to ask the server what it computes. */
export function datesReady(values: DateValues, hourly: boolean): boolean {
  if (values.start_date === "") return false;
  if (hourly) return values.start_time !== "" && values.end_time > values.start_time;
  return values.end_date !== "" && values.end_date >= values.start_date;
}

/** What cannot be right, as [input, message] pairs, before anything is sent. */
export function dateIssues(values: DateValues, hourly: boolean, t: Translate): [keyof DateValues, string][] {
  const issues: [keyof DateValues, string][] = [];
  if (!values.start_date) issues.push(["start_date", t("formErrors.required")]);
  if (hourly) {
    if (!values.start_time) issues.push(["start_time", t("formErrors.required")]);
    if (!values.end_time) issues.push(["end_time", t("formErrors.required")]);
    if (values.start_time && values.end_time && values.end_time <= values.start_time) {
      issues.push(["end_time", t("formErrors.times")]);
    }
    return issues;
  }
  if (!values.end_date) issues.push(["end_date", t("formErrors.required")]);
  else if (values.start_date && values.end_date < values.start_date) {
    issues.push(["end_date", t("formErrors.endBeforeStart")]);
  }
  if (values.start_date !== "" && values.start_date === values.end_date && values.starts_at_midday && values.ends_at_midday) {
    issues.push(["ends_at_midday", t("formErrors.bothHalves")]);
  }
  return issues;
}
