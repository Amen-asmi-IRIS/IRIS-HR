import i18n, { type Lang } from "@/i18n";

const ZONE = "Africa/Tunis";
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

type DateInput = string | Date;

/** A plain YYYY-MM-DD is a calendar date and has no zone; anything else is an instant shown in Tunis time. */
function resolve(value: DateInput): { date: Date; zone: string } {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { date: new Date(Date.UTC(year, month - 1, day)), zone: "UTC" };
  }
  return { date: value instanceof Date ? value : new Date(value), zone: ZONE };
}

export function formatDate(value: DateInput, lang: Lang): string {
  const { date, zone } = resolve(value);
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(date);
}

export function formatDateRange(start: DateInput, end: DateInput, lang: Lang): string {
  const first = formatDate(start, lang);
  const last = formatDate(end, lang);
  return first === last ? first : i18n.t("common:dateRange", { lng: lang, start: first, end: last });
}

export function formatDateTime(value: DateInput, lang: Lang): string {
  const { date } = resolve(value);
  const time = new Intl.DateTimeFormat(LOCALES[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE }).format(date);
  return i18n.t("common:dateTime", { lng: lang, date: formatDate(date, lang), time });
}

export function formatNumber(value: number | string, lang: Lang, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits }).format(Number(value));
}

function withUnit(value: number | string, lang: Lang, unit: "day" | "hour"): string {
  const amount = Number(value);
  const form = new Intl.PluralRules(LOCALES[lang]).select(amount) === "one" ? "one" : "other";
  return `${formatNumber(amount, lang)} ${i18n.t(`common:units.${unit}.${form}`, { lng: lang })}`;
}

/** "2,5 jours" / "2.5 days". Days allow halves. */
export function formatDays(value: number | string, lang: Lang): string {
  return withUnit(value, lang, "day");
}

/** "1,25 heure" / "1.25 hours". Hours allow quarters. */
export function formatHours(value: number | string, lang: Lang): string {
  return withUnit(value, lang, "hour");
}

export function formatBytes(bytes: number, lang: Lang): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes >= GB) return `${formatNumber(bytes / GB, lang, 1)} ${i18n.t("common:units.gb", { lng: lang })}`;
  if (bytes >= MB) return `${formatNumber(bytes / MB, lang, 1)} ${i18n.t("common:units.mb", { lng: lang })}`;
  return `${formatNumber(bytes / KB, lang, 0)} ${i18n.t("common:units.kb", { lng: lang })}`;
}
