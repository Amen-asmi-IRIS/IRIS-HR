import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

import type { CalendarEntry, CalendarFeed, CalendarHoliday, CalendarQuery } from "@/api/types";

export type { CalendarEntry, CalendarFeed, CalendarHoliday };
export type CalendarViewMode = "month" | "week";
export type CalendarScope = CalendarQuery["scope"];
export type DayPart = "full" | "morning" | "afternoon";

export interface DayEntry {
  entry: CalendarEntry;
  part: DayPart;
}

const MONDAY_FIRST = { weekStartsOn: 1 as const };

export function toIso(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

export function fromIso(iso: string): Date {
  return parseISO(iso);
}

export function rangeFor(view: CalendarViewMode, anchor: Date): { from: Date; to: Date } {
  if (view === "week") {
    return { from: startOfWeek(anchor, MONDAY_FIRST), to: endOfWeek(anchor, MONDAY_FIRST) };
  }
  return {
    from: startOfWeek(startOfMonth(anchor), MONDAY_FIRST),
    to: endOfWeek(endOfMonth(anchor), MONDAY_FIRST),
  };
}

export function weeksFor(view: CalendarViewMode, anchor: Date): Date[][] {
  const { from, to } = rangeFor(view, anchor);
  const days = eachDayOfInterval({ start: from, end: to });
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export function shiftAnchor(view: CalendarViewMode, anchor: Date, delta: 1 | -1): Date {
  return view === "week" ? addWeeks(anchor, delta) : addMonths(anchor, delta);
}

const USUAL_WEEK: readonly number[] = [1, 2, 3, 4, 5];

/** ISO weekday: Monday = 1 … Sunday = 7, as HR's `working_week` setting counts them. */
export function isoWeekday(day: Date): number {
  const weekday = getDay(day);
  return weekday === 0 ? 7 : weekday;
}

/** A day outside the working week. The week comes from the feed; without one, Monday to Friday. */
export function isWeekend(day: Date, workingWeek: readonly number[] = USUAL_WEEK): boolean {
  return !workingWeek.includes(isoWeekday(day));
}

/** Which part of `iso` the entry covers; null when the day is outside the entry. ISO dates compare as text. */
export function partForDay(entry: CalendarEntry, iso: string): DayPart | null {
  if (iso < entry.start_date || iso > entry.end_date) {
    return null;
  }
  const first = iso === entry.start_date;
  const last = iso === entry.end_date;
  if (first && entry.starts_at_midday && !(last && entry.ends_at_midday)) {
    return "afternoon";
  }
  if (last && entry.ends_at_midday && !(first && entry.starts_at_midday)) {
    return "morning";
  }
  return "full";
}

export function holidayOn(holidays: CalendarHoliday[], iso: string): CalendarHoliday | undefined {
  return holidays.find((holiday) => holiday.date === iso);
}

export function entriesOn(feed: CalendarFeed, day: Date): DayEntry[] {
  const iso = toIso(day);
  if (isWeekend(day, feed.working_week) || holidayOn(feed.holidays, iso)) {
    return [];
  }
  const result: DayEntry[] = [];
  for (const entry of feed.entries) {
    const part = partForDay(entry, iso);
    if (part) {
      result.push({ entry, part });
    }
  }
  return result.sort((a, b) => Number(b.entry.mine) - Number(a.entry.mine) || a.entry.employee.name.localeCompare(b.entry.employee.name));
}
