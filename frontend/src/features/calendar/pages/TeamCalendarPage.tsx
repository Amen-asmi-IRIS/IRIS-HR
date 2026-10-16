import { useTranslation } from "react-i18next";

import { FilterBar, FilterSelect, PageHeader } from "@/components";

import { useCalendar } from "../api";
import { CalendarToolbar } from "../CalendarToolbar";
import { CalendarView } from "../CalendarView";
import { applyFilters, offered, peopleIn, typesIn, withAll } from "../filters";
import { rangeFor, toIso } from "../model";
import { useCalendarState, useUrlParam } from "../useCalendarState";

export default function TeamCalendarPage() {
  const { t } = useTranslation("calendar");
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const [person, setPerson] = useUrlParam("person");
  const [type, setType] = useUrlParam("type");
  const { from, to } = rangeFor(view, anchor);
  const calendar = useCalendar({ from: toIso(from), to: toIso(to), scope: "team" });
  if (calendar.error) {
    throw calendar.error;
  }
  const people = withAll(t("filter.everyone"), peopleIn(calendar.data));
  const types = withAll(t("filter.allTypes"), typesIn(calendar.data));

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")}>{t("hint.team")}</PageHeader>
      <FilterBar>
        <FilterSelect label={t("filter.person")} value={offered(person, people)} options={people} onChange={setPerson} />
        <FilterSelect label={t("filter.type")} value={offered(type, types)} options={types} onChange={setType} />
      </FilterBar>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView feed={applyFilters(calendar.data, { person: offered(person, people), type: offered(type, types), status: "" })}
                    isLoading={calendar.isPending} view={view} anchor={anchor} onAnchorChange={setAnchor} />
    </div>
  );
}
