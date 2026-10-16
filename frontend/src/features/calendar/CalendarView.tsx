import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfWeek } from "date-fns";
import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useIsPhone } from "@/components";
import { cn } from "@/lib/utils";

import { formatDayLong, formatDayShort, formatPeriodTitle, weekdayNames } from "./dates";
import {
  entriesOn, holidayOn, isWeekend, rangeFor, shiftAnchor, toIso, weeksFor,
  type CalendarEntry, type CalendarFeed, type CalendarViewMode, type DayEntry, type DayPart,
} from "./model";

export interface CalendarViewProps {
  feed: CalendarFeed | undefined;
  isLoading: boolean;
  view: CalendarViewMode;
  anchor: Date;
  onAnchorChange: (anchor: Date) => void;
  onDayAction?: (iso: string) => void;
}

const EMPTY_FEED: CalendarFeed = { holidays: [], entries: [], working_week: [1, 2, 3, 4, 5] };
const MONTH_CHIPS = 3;
const MONDAY_FIRST = { weekStartsOn: 1 as const };

const TYPE_TONES: Record<string, string> = {
  annual: "bg-type-annual-bg text-type-annual",
  sick: "bg-type-sick-bg text-type-sick",
  exceptional: "bg-type-exceptional-bg text-type-exceptional",
  remote: "bg-type-remote-bg text-type-remote",
  permission: "bg-type-permission-bg text-type-permission",
};

/** The colour never depends on something the server withheld: without a type code, only the label decides. */
function toneOf(entry: CalendarEntry): string {
  if (entry.type_code && TYPE_TONES[entry.type_code]) {
    return TYPE_TONES[entry.type_code];
  }
  return entry.label === "remote" ? "bg-type-remote-bg text-type-remote" : "bg-info-bg text-info";
}

export function entryText(entry: CalendarEntry, part: DayPart, t: TFunction<"calendar">): string {
  const what = entry.type_name ?? t(`label.${entry.label}`);
  const half = part === "full" ? "" : ` (${t(`part.${part}`)})`;
  const waiting = entry.status === "pending" ? ` · ${t("pending")}` : "";
  return `${what}${half}${waiting}`;
}

function EntryChip({ item, focusable }: { item: DayEntry; focusable: boolean }) {
  const { t } = useTranslation("calendar");
  const { entry, part } = item;
  const who = entry.mine ? t("you") : entry.employee.name;
  // A chip wraps rather than being cut: a cut chip lost its type, its half-day and its "waiting".
  // A waiting request is drawn hollow, with a dashed border in its colour, so that it stands apart from
  // an approved one at a glance.
  const className = cn(
    "block break-words rounded-sm border border-border px-1.5 py-0.5 text-caption",
    toneOf(entry),
    entry.status === "pending" && "border-dashed border-current bg-card",
  );
  const text = entryText(entry, part, t);
  const content = (
    <>
      <span className="font-semibold">{who}</span>
      {" · "}
      {text}
    </>
  );
  const whole = `${who} · ${text}`;
  if (entry.request_public_id) {
    return (
      <Link
        to={`/requests/${entry.request_public_id}`}
        title={whole}
        tabIndex={focusable ? 0 : -1}
        className={cn(className, "hover:underline")}
      >
        {content}
      </Link>
    );
  }
  return (
    <span title={whole} className={className}>
      {content}
    </span>
  );
}

export function CalendarView({ feed, isLoading, view, anchor, onAnchorChange, onDayAction }: CalendarViewProps) {
  const { t } = useTranslation("calendar");
  const isPhone = useIsPhone();

  if (isLoading && !feed) {
    return <p role="status" className="py-10 text-center text-body text-muted-foreground">{t("loading")}</p>;
  }
  const data = feed ?? EMPTY_FEED;
  return isPhone
    ? <Agenda feed={data} view={view} anchor={anchor} />
    : <Grid feed={data} view={view} anchor={anchor} onAnchorChange={onAnchorChange} onDayAction={onDayAction} />;
}

interface GridProps {
  feed: CalendarFeed;
  view: CalendarViewMode;
  anchor: Date;
  onAnchorChange: (anchor: Date) => void;
  onDayAction?: (iso: string) => void;
}

function Grid({ feed, view, anchor, onAnchorChange, onDayAction }: GridProps) {
  const { t, i18n } = useTranslation("calendar");
  const language = i18n.language;
  const weeks = useMemo(() => weeksFor(view, anchor), [view, anchor]);
  const visible = useMemo(() => weeks.flat().map(toIso), [weeks]);
  const [focusedIso, setFocusedIso] = useState(() => toIso(anchor));
  const cells = useRef(new Map<string, HTMLDivElement>());
  const moveFocus = useRef(false);

  // The day in the tab order: the last focused one while it is on screen, otherwise the anchor.
  const activeIso = visible.includes(focusedIso) ? focusedIso : toIso(anchor);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      cells.current.get(activeIso)?.focus();
    }
  }, [activeIso, visible]);

  function focusDay(target: Date) {
    const day = startOfDay(target);
    moveFocus.current = true;
    setFocusedIso(toIso(day));
    if (!visible.includes(toIso(day))) {
      onAnchorChange(day);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, day: Date, canAct: boolean) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => startOfWeek(day, MONDAY_FIRST),
      End: () => endOfWeek(day, MONDAY_FIRST),
      PageUp: () => shiftAnchor(view, day, -1),
      PageDown: () => shiftAnchor(view, day, 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusDay(move());
      return;
    }
    // Only when the day itself has the focus, not a link or the button inside it.
    if ((event.key === "Enter" || event.key === " ") && canAct && onDayAction && event.target === event.currentTarget) {
      event.preventDefault();
      onDayAction(toIso(day));
    }
  }

  const today = new Date();
  const chipLimit = view === "week" ? Number.POSITIVE_INFINITY : MONTH_CHIPS;

  return (
    <div role="grid" aria-label={t("grid", { period: formatPeriodTitle(view, anchor, language) })}
         className="overflow-hidden rounded-xl border border-border bg-card">
      <div role="row" className="grid grid-cols-7 bg-muted">
        {weekdayNames(language).map((name) => (
          <div key={name.long} role="columnheader" aria-label={name.long}
               className="px-2 py-2 text-caption font-medium text-muted-foreground first-letter:uppercase">
            <span aria-hidden="true">{name.short}</span>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={toIso(week[0])} role="row" className="grid grid-cols-7 border-t border-divider">
          {week.map((day) => {
            const iso = toIso(day);
            const holiday = holidayOn(feed.holidays, iso);
            const items = entriesOn(feed, day);
            const working = !isWeekend(day, feed.working_week) && !holiday;
            const outside = view === "month" && !isSameMonth(day, anchor);
            const active = iso === activeIso;
            const canAct = working && !outside;
            const shown = items.slice(0, chipLimit);
            const hidden = items.length - shown.length;
            const label = [
              formatDayLong(day, language),
              holiday ? t("holiday", { name: holiday.name }) : null,
              items.length > 0
                ? items.map((item) => `${item.entry.mine ? t("you") : item.entry.employee.name}, ${entryText(item.entry, item.part, t)}`).join("; ")
                : working ? t("nobody") : null,
            ].filter(Boolean).join(". ");

            return (
              <div key={iso} role="gridcell" aria-label={label} aria-current={isSameDay(day, today) ? "date" : undefined}
                   tabIndex={active ? 0 : -1}
                   ref={(node) => { if (node) { cells.current.set(iso, node); } else { cells.current.delete(iso); } }}
                   onFocus={() => setFocusedIso(iso)}
                   onKeyDown={(event) => onKeyDown(event, day, canAct)}
                   className={cn(
                     "group relative border-l border-divider p-1.5 first:border-l-0",
                     view === "week" ? "min-h-64" : "min-h-28",
                     (outside || !working) && "bg-muted",
                   )}>
                <div className="flex items-center justify-between">
                  <span aria-hidden="true"
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full text-caption font-medium tabular-nums",
                          isSameDay(day, today) ? "bg-primary text-primary-foreground" : outside ? "text-muted-foreground" : "text-text-secondary",
                        )}>
                    {format(day, "d")}
                  </span>
                  {onDayAction && canAct ? (
                    <button type="button" tabIndex={active ? 0 : -1}
                            aria-label={t("newRequestOn", { date: formatDayShort(day, language) })}
                            onClick={() => onDayAction(iso)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-primary opacity-0 hover:bg-primary-soft focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100">
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </div>
                {holiday ? <p className="mt-1 truncate text-caption font-medium text-waiting">{holiday.name}</p> : null}
                {shown.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {shown.map((item, index) => (
                      <li key={`${item.entry.request_public_id ?? item.entry.employee.public_id}-${index}`}>
                        <EntryChip item={item} focusable={active} />
                      </li>
                    ))}
                    {hidden > 0 ? <li className="text-caption text-muted-foreground">{t("more", { count: hidden })}</li> : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Agenda({ feed, view, anchor }: { feed: CalendarFeed; view: CalendarViewMode; anchor: Date }) {
  const { t, i18n } = useTranslation("calendar");
  const language = i18n.language;
  const { from, to } = rangeFor(view, anchor);
  const rows = eachDayOfInterval({ start: from, end: to })
    .filter((day) => view === "week" || isSameMonth(day, anchor))
    .map((day) => ({ day, iso: toIso(day), holiday: holidayOn(feed.holidays, toIso(day)), items: entriesOn(feed, day) }))
    .filter((row) => row.holiday || row.items.length > 0);

  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-4 text-body text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <ul aria-label={t("agenda", { period: formatPeriodTitle(view, anchor, language) })} className="space-y-3">
      {rows.map((row) => (
        <li key={row.iso} className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-body font-semibold text-foreground">{formatDayLong(row.day, language)}</h3>
          {row.holiday ? <p className="mt-1 text-caption font-medium text-waiting">{t("holiday", { name: row.holiday.name })}</p> : null}
          {row.items.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {row.items.map((item, index) => (
                <li key={`${item.entry.request_public_id ?? item.entry.employee.public_id}-${index}`}
                    className="flex min-h-11 items-center">
                  <EntryChip item={item} focusable />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
