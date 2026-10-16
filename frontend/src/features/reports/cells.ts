import type { Lang } from "@/i18n";
import { formatDate, formatDateRange, formatDateTime, formatNumber } from "@/lib/format";
import type { ColumnKind, ReportCell } from "./api";

/** One cell of a report as text, written like every other date and number of the application. */
export function formatCell(value: ReportCell | undefined, kind: ColumnKind, lang: Lang): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return kind === "period" ? formatDateRange(value.start, value.end, lang) : "";
  if (kind === "number") return formatNumber(value, lang);
  if (kind === "date") return formatDate(String(value), lang);
  if (kind === "datetime") return formatDateTime(String(value), lang);
  return String(value);
}
