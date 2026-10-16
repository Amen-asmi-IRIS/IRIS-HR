import type { CalendarEntry, CalendarFeed } from "./model";

export function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    employee: { public_id: "11111111-1111-4111-8111-111111111111", name: "Sana Trabelsi" },
    start_date: "2026-11-03",
    end_date: "2026-11-03",
    starts_at_midday: false,
    ends_at_midday: false,
    label: "absent",
    type_code: null,
    type_name: null,
    status: null,
    request_public_id: null,
    mine: false,
    ...overrides,
  };
}

export function makeFeed(overrides: Partial<CalendarFeed> = {}): CalendarFeed {
  return { holidays: [], entries: [], working_week: [1, 2, 3, 4, 5], ...overrides };
}
