import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatPeriodTitle } from "./dates";
import { shiftAnchor, type CalendarViewMode } from "./model";

export interface CalendarToolbarProps {
  view: CalendarViewMode;
  anchor: Date;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorChange: (anchor: Date) => void;
}

const VIEWS: CalendarViewMode[] = ["month", "week"];

export function CalendarToolbar({ view, anchor, onViewChange, onAnchorChange }: CalendarToolbarProps) {
  const { t, i18n } = useTranslation("calendar");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="icon" className="min-h-11 min-w-11 md:min-h-10 md:min-w-10"
                aria-label={t("toolbar.previous")} onClick={() => onAnchorChange(shiftAnchor(view, anchor, -1))}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button type="button" className="min-h-11 md:min-h-10" onClick={() => onAnchorChange(new Date())}>
          {t("toolbar.today")}
        </Button>
        <Button type="button" size="icon" className="min-h-11 min-w-11 md:min-h-10 md:min-w-10"
                aria-label={t("toolbar.next")} onClick={() => onAnchorChange(shiftAnchor(view, anchor, 1))}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <h2 aria-live="polite" className="ml-2 text-section font-semibold text-foreground first-letter:uppercase">
          {formatPeriodTitle(view, anchor, i18n.language)}
        </h2>
      </div>
      <div role="group" aria-label={t("toolbar.view")} className="inline-flex rounded-md bg-accent p-1">
        {VIEWS.map((mode) => (
          <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onViewChange(mode)}
                  className={cn(
                    "min-h-11 rounded-sm px-3 text-body font-medium text-text-secondary md:min-h-8",
                    view === mode && "bg-card text-foreground",
                  )}>
            {t(`toolbar.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
