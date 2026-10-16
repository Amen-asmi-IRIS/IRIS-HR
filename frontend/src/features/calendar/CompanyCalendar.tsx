import { useTranslation } from "react-i18next";

import { FilterBar, FilterSelect, PageHeader } from "@/components";
import { useDepartments } from "@/features/employees/api";

import { useCalendar } from "./api";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarView } from "./CalendarView";
import { applyFilters, offered, peopleIn, typesIn, withAll } from "./filters";
import { rangeFor, toIso } from "./model";
import { useCalendarState, useUrlParam } from "./useCalendarState";

/** The whole company with types and pending requests. Read-only: it serves the HR desk and the Overview alike. */
export function CompanyCalendar() {
  const { t } = useTranslation("calendar");
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const [department, setDepartment] = useUrlParam("department");
  const [person, setPerson] = useUrlParam("person");
  const [type, setType] = useUrlParam("type");
  const [status, setStatus] = useUrlParam("status");
  const departmentList = useDepartments();
  const { from, to } = rangeFor(view, anchor);
  const departmentId = /^\d+$/.test(department) ? Number(department) : undefined;
  const calendar = useCalendar({
    from: toIso(from), to: toIso(to), scope: "company",
    ...(departmentId === undefined ? {} : { department: departmentId }),
  });
  if (calendar.error) {
    throw calendar.error;
  }

  const departments = withAll(
    t("filter.allDepartments"),
    (departmentList.data ?? [])
      .filter((item) => item.is_active)
      .map((item) => ({ value: String(item.id), label: item.name })),
  );
  const people = withAll(t("filter.everyone"), peopleIn(calendar.data));
  const types = withAll(t("filter.allTypes"), typesIn(calendar.data));
  const statuses = withAll(t("filter.allStatuses"), [
    { value: "approved", label: t("filter.approved") },
    { value: "pending", label: t("filter.pendingOnly") },
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")}>{t("hint.company")}</PageHeader>
      <FilterBar
        more={
          <>
            <FilterSelect label={t("filter.type")} value={offered(type, types)} options={types} onChange={setType} />
            <FilterSelect label={t("filter.status")} value={offered(status, statuses)} options={statuses} onChange={setStatus} />
          </>
        }
      >
        <FilterSelect label={t("filter.department")} value={offered(department, departments)} options={departments} onChange={setDepartment} />
        <FilterSelect label={t("filter.person")} value={offered(person, people)} options={people} onChange={setPerson} />
      </FilterBar>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView
        feed={applyFilters(calendar.data, { person: offered(person, people), type: offered(type, types), status: offered(status, statuses) })}
        isLoading={calendar.isPending} view={view} anchor={anchor} onAnchorChange={setAnchor}
      />
    </div>
  );
}
