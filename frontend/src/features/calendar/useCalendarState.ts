import { isValid, parseISO, startOfDay } from "date-fns";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { toIso, type CalendarViewMode } from "./model";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One query-string parameter as state. An empty value removes it from the address. */
export function useUrlParam(name: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? "";
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (previous) => {
          const copy = new URLSearchParams(previous);
          if (next) {
            copy.set(name, next);
          } else {
            copy.delete(name);
          }
          return copy;
        },
        { replace: true },
      );
    },
    [name, setParams],
  );
  return [value, setValue];
}

export function useCalendarState() {
  const [rawView, setRawView] = useUrlParam("view");
  const [rawDate, setRawDate] = useUrlParam("date");

  const view: CalendarViewMode = rawView === "week" ? "week" : "month";
  const anchor = useMemo(() => {
    const parsed = ISO_DATE.test(rawDate) ? parseISO(rawDate) : null;
    return parsed && isValid(parsed) ? parsed : startOfDay(new Date());
  }, [rawDate]);

  return {
    view,
    anchor,
    setView: (next: CalendarViewMode) => setRawView(next === "week" ? "week" : ""),
    setAnchor: (next: Date) => setRawDate(toIso(next)),
  };
}
