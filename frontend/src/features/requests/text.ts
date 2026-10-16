import type { Lang } from "@/i18n";
import { formatDate, formatDateRange, formatDays, formatHours } from "@/lib/format";
import type { Translate } from "./platform";
import type { RequestOut } from "./types";

type Dated = Pick<
  RequestOut,
  "type" | "start_date" | "end_date" | "starts_at_midday" | "ends_at_midday" | "start_time" | "end_time"
>;

const hhmm = (time: string | null) => (time ?? "").slice(0, 5);

/** The separator between the parts of one line ("Congé annuel · approuvée"). */
export const SEPARATOR = " · ";

/** The parts of one line, side by side. */
export function joined(...parts: string[]): string {
  return parts.join(SEPARATOR);
}

/** "9 to 11 November, from midday on the first day", "9 November, morning", "9 November, 14:00 to 16:30". */
export function describeWhen(request: Dated, t: Translate, lang: Lang): string {
  if (request.type.unit === "hour") {
    return t("when.hours", {
      date: formatDate(request.start_date, lang),
      from: hhmm(request.start_time),
      to: hhmm(request.end_time),
    });
  }
  if (request.start_date === request.end_date) {
    const date = formatDate(request.start_date, lang);
    if (request.starts_at_midday) return t("when.afternoon", { date });
    if (request.ends_at_midday) return t("when.morning", { date });
    return date;
  }
  const range = formatDateRange(request.start_date, request.end_date, lang);
  if (request.starts_at_midday && request.ends_at_midday) return t("when.rangeBoth", { range });
  if (request.starts_at_midday) return t("when.rangeFromMidday", { range });
  if (request.ends_at_midday) return t("when.rangeUntilMidday", { range });
  return range;
}

/** "2.5 days" or "1.25 hours", as the server counted them. */
export function describeQuantity(request: Pick<RequestOut, "type" | "quantity">, lang: Lang): string {
  return request.type.unit === "hour" ? formatHours(request.quantity, lang) : formatDays(request.quantity, lang);
}
