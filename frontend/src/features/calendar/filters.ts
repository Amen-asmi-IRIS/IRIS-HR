import type { CalendarFeed } from "./model";

export interface FilterOption {
  value: string;
  label: string;
}

export interface EntryFilters {
  person: string;
  type: string;
  status: string;
}

function unique(options: FilterOption[]): FilterOption[] {
  const byValue = new Map(options.map((option) => [option.value, option]));
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function peopleIn(feed: CalendarFeed | undefined): FilterOption[] {
  return unique((feed?.entries ?? []).map((entry) => ({ value: entry.employee.public_id, label: entry.employee.name })));
}

export function typesIn(feed: CalendarFeed | undefined): FilterOption[] {
  return unique(
    (feed?.entries ?? []).flatMap((entry) =>
      entry.type_code && entry.type_name ? [{ value: entry.type_code, label: entry.type_name }] : []),
  );
}

/** The options of a filter, with the choice that filters nothing first. */
export function withAll(allLabel: string, options: FilterOption[]): FilterOption[] {
  return [{ value: "", label: allLabel }, ...options];
}

/** A value that is no longer offered (the person has no entry in this period) reads as "all". */
export function offered(value: string, options: FilterOption[]): string {
  return options.some((option) => option.value === value) ? value : "";
}

export function applyFilters(feed: CalendarFeed | undefined, filters: EntryFilters): CalendarFeed | undefined {
  if (!feed || (!filters.person && !filters.type && !filters.status)) {
    return feed;
  }
  return {
    ...feed,
    entries: feed.entries.filter((entry) =>
      (!filters.person || entry.employee.public_id === filters.person)
      && (!filters.type || entry.type_code === filters.type)
      && (!filters.status || entry.status === filters.status)),
  };
}
