import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import { AFFECTED_KEYS } from "@/features/requests/api";

import type { CalendarFeed, CalendarScope } from "./model";

export interface CalendarParams {
  from: string;
  to: string;
  scope: CalendarScope;
  department?: number;
}

export const calendarKeys = {
  all: ["calendar"] as const,
  feed: (params: CalendarParams) => ["calendar", "feed", params] as const,
};

// A request that is sent, decided, changed or cancelled changes the calendar: plan 03b reads these keys again.
AFFECTED_KEYS.push(calendarKeys.all);

export function useCalendar(params: CalendarParams) {
  return useQuery({
    queryKey: calendarKeys.feed(params),
    queryFn: async (): Promise<CalendarFeed> =>
      call(api.GET("/api/v1/calendar", { params: { query: params } })),
    // Keep the previous period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}
