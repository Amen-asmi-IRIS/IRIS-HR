import { FilterDateRange, FilterSelect } from "@/components";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { todayISO } from "@/lib/dates";
import { useDepartmentOptions, useRequestTypes } from "../api";
import { useRequestsText } from "../platform";

export type FilterName =
  | "status" | "type" | "year" | "employee" | "period" | "department" | "on_behalf" | "has_override";

/** The query parameters of `GET requests` a list can filter on, empty by default. */
export const FILTER_DEFAULTS = {
  status: "",
  type: "",
  year: "",
  employee: "",
  from: "",
  to: "",
  department: "",
  on_behalf: "",
  has_override: "",
};

export type FilterValues = typeof FILTER_DEFAULTS;

const STATUSES = ["draft", "pending", "returned", "approved", "rejected", "withdrawn", "cancelled"] as const;

interface RequestFilterProps {
  name: FilterName;
  values: FilterValues;
  set: (key: keyof FilterValues, value: string) => void;
}

/** One filter of a request list, drawn with plan 01b's filter controls. The value lives in the address. */
export function RequestFilter({ name, values, set }: RequestFilterProps) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const departments = useDepartmentOptions(lang, name === "department");
  const all = { value: "", label: t("common.all") };
  const yesNo = [all, { value: "1", label: t("common.yes") }, { value: "0", label: t("common.no") }];

  switch (name) {
    case "status":
      return (
        <FilterSelect
          label={t("filters.statusLabel")}
          value={values.status}
          onChange={(value) => set("status", value)}
          options={[all, ...STATUSES.map((status) => ({ value: status, label: t(`filters.status.${status}`) }))]}
        />
      );
    case "type":
      return (
        <FilterSelect
          label={t("filters.typeLabel")}
          value={values.type}
          onChange={(value) => set("type", value)}
          options={[all, ...(types.data ?? []).map((type) => ({ value: type.code, label: type.name }))]}
        />
      );
    case "year": {
      const current = Number(todayISO().slice(0, 4));
      const years = [current + 1, current, current - 1, current - 2].map(String);
      return (
        <FilterSelect
          label={t("filters.yearLabel")}
          value={values.year}
          onChange={(value) => set("year", value)}
          options={[all, ...years.map((year) => ({ value: year, label: year }))]}
        />
      );
    }
    case "employee":
      return (
        <div className="w-full md:w-56">
          <EmployeePicker
            label={t("filters.employee")}
            value={values.employee === "" ? null : values.employee}
            onChange={(publicId) => set("employee", publicId ?? "")}
            allowNone
            noneLabel={t("common.all")}
          />
        </div>
      );
    case "period":
      return (
        <FilterDateRange
          label={t("filters.period")}
          from={values.from}
          to={values.to}
          onFrom={(value) => set("from", value)}
          onTo={(value) => set("to", value)}
        />
      );
    case "department":
      return (
        <FilterSelect
          label={t("filters.department")}
          value={values.department}
          onChange={(value) => set("department", value)}
          options={[all, ...(departments.data ?? [])]}
        />
      );
    case "on_behalf":
      return (
        <FilterSelect
          label={t("filters.onBehalf")}
          value={values.on_behalf}
          onChange={(value) => set("on_behalf", value)}
          options={yesNo}
        />
      );
    case "has_override":
      return (
        <FilterSelect
          label={t("filters.hasOverride")}
          value={values.has_override}
          onChange={(value) => set("has_override", value)}
          options={yesNo}
        />
      );
  }
}
