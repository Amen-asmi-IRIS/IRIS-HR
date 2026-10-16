import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ReportFilterOptions } from "@/api/types";
import { FilterBar } from "@/components/FilterBar";
import { FilterDateRange, FilterSelect, FilterText } from "@/components/filters";
import type { ReportQuery } from "./api";
import type { FilterKey } from "./definitions";

interface Option {
  value: string;
  label: string;
}

interface ReportFiltersProps {
  filters: { visible: FilterKey[]; more: FilterKey[] };
  options: ReportFilterOptions | undefined;
  values: ReportQuery;
  /** The changed keys; an empty string means "no filter". */
  onChange: (patch: ReportQuery) => void;
}

function yearOptions(selected: string | undefined): Option[] {
  const current = new Date().getFullYear();
  const years = new Set<string>(Array.from({ length: 5 }, (_, index) => String(current - index)));
  if (selected) years.add(selected);
  return [...years].sort((a, b) => Number(b) - Number(a)).map((year) => ({ value: year, label: year }));
}

export function ReportFilters({ filters, options, values, onChange }: ReportFiltersProps) {
  const { t } = useTranslation("reports");
  const all: Option = { value: "", label: t("common:filters.all") };

  const control = (key: FilterKey): ReactNode => {
    switch (key) {
      case "period":
        return (
          <FilterDateRange
            key="period"
            label={t("filters.period")}
            from={values.from ?? ""}
            to={values.to ?? ""}
            onFrom={(value) => onChange({ from: value })}
            onTo={(value) => onChange({ to: value })}
          />
        );
      case "on":
        return (
          <FilterText
            key="on"
            type="date"
            label={t("filters.on")}
            value={values.on ?? ""}
            onChange={(value) => onChange({ on: value })}
          />
        );
      case "year":
        return (
          <FilterSelect
            key="year"
            label={t("filters.year")}
            value={values.year ?? ""}
            options={yearOptions(values.year)}
            onChange={(value) => onChange({ year: value })}
          />
        );
      case "department":
        return (
          <FilterSelect
            key="department"
            label={t("filters.department")}
            value={values.department ?? ""}
            options={[all, ...(options?.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))]}
            onChange={(value) => onChange({ department: value })}
          />
        );
      case "employee":
        return (
          <FilterSelect
            key="employee"
            label={t("filters.employee")}
            value={values.employee ?? ""}
            options={[all, ...(options?.employees ?? []).map((item) => ({ value: item.public_id, label: item.name }))]}
            onChange={(value) => onChange({ employee: value })}
          />
        );
      case "type":
        return (
          <FilterSelect
            key="type"
            label={t("filters.type")}
            value={values.type ?? ""}
            options={[all, ...(options?.types ?? []).map((item) => ({ value: item.code, label: item.name }))]}
            onChange={(value) => onChange({ type: value })}
          />
        );
      case "step":
        return (
          <FilterSelect
            key="step"
            label={t("filters.step")}
            value={values.step ?? ""}
            options={[all, ...(options?.steps ?? []).map((item) => ({ value: item.code, label: item.name }))]}
            onChange={(value) => onChange({ step: value })}
          />
        );
    }
  };

  return (
    <FilterBar more={filters.more.length > 0 ? <>{filters.more.map(control)}</> : undefined}>
      {filters.visible.map(control)}
    </FilterBar>
  );
}
