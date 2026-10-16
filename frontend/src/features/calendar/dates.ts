import { addDays, format, isSameMonth, isSameYear, startOfWeek, type Locale } from "date-fns";
import { enGB, fr } from "date-fns/locale";

import type { CalendarViewMode } from "./model";
import { rangeFor } from "./model";

export function localeOf(language: string): Locale {
  return language.toLowerCase().startsWith("en") ? enGB : fr;
}

export function formatDayLong(day: Date, language: string): string {
  return format(day, "EEEE d MMMM yyyy", { locale: localeOf(language) });
}

export function formatDayShort(day: Date, language: string): string {
  return format(day, "EEE d MMM", { locale: localeOf(language) });
}

export function formatPeriodTitle(view: CalendarViewMode, anchor: Date, language: string): string {
  const locale = localeOf(language);
  if (view === "month") {
    return format(anchor, "MMMM yyyy", { locale });
  }
  const { from, to } = rangeFor("week", anchor);
  if (isSameMonth(from, to)) {
    return `${format(from, "d", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
  }
  if (isSameYear(from, to)) {
    return `${format(from, "d MMMM", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
  }
  return `${format(from, "d MMMM yyyy", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
}

export function weekdayNames(language: string): { short: string; long: string }[] {
  const locale = localeOf(language);
  const monday = startOfWeek(new Date(2026, 10, 2), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    return { short: format(day, "EEE", { locale }), long: format(day, "EEEE", { locale }) };
  });
}
