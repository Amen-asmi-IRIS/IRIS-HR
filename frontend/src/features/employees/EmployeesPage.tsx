import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterText,
  PageHeader,
  Pager,
  useListParams,
} from "@/components";
import { Button } from "@/components/ui/button";

import { type EmployeeListParams, type EmployeeRow, useDepartments, useEmployees } from "./api";
import { EmployeeStatusBadge } from "./ui";

const PAGE_SIZE = 25;

export default function EmployeesPage({ mode }: { mode: "hr" | "overview" }) {
  const { t } = useTranslation("employees");
  const { filters, page, sort, setFilter, setPage, setSort } = useListParams({ search: "", department: "", status: "" });
  const departments = useDepartments();
  const list = useEmployees({
    scope: "all",
    search: filters.search || undefined,
    department: filters.department ? Number(filters.department) : undefined,
    status: (filters.status || undefined) as EmployeeListParams["status"],
    ordering: (sort || undefined) as EmployeeListParams["ordering"],
    page,
  });
  const recordBase = mode === "hr" ? "/hr/employees" : "/overview/people";
  // The page carries the name its workspace gives it in the navigation.
  const title = t(mode === "hr" ? "directory.title" : "directory.titleOverview");

  if (list.error) {
    throw list.error;
  }

  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: t("directory.columns.name"),
      sortBy: "name",
      cell: (row: EmployeeRow) => (
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={`${recordBase}/${row.public_id}`}
        >
          {row.name}
        </Link>
      ),
    },
    { key: "number", header: t("directory.columns.number"), cell: (row: EmployeeRow) => row.employee_number, sortBy: "employee_number" },
    { key: "department", header: t("directory.columns.department"), cell: (row: EmployeeRow) => row.department.name },
    { key: "position", header: t("directory.columns.position"), cell: (row: EmployeeRow) => row.position.title },
    {
      key: "manager",
      header: t("directory.columns.manager"),
      cell: (row: EmployeeRow) => row.manager?.name ?? t("directory.noManager"),
    },
    {
      key: "status",
      header: t("directory.columns.status"),
      cell: (row: EmployeeRow) => (row.status ? <EmployeeStatusBadge status={row.status} /> : null),
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        primary={
          mode === "hr" ? (
            <Button variant="primary" asChild>
              <Link to="/hr/employees/new">{t("directory.new")}</Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar>
        <FilterText
          label={t("directory.search")}
          value={filters.search}
          onChange={(value) => setFilter("search", value)}
        />
        <FilterSelect
          label={t("directory.department")}
          value={filters.department}
          onChange={(value) => setFilter("department", value)}
          options={[
            { value: "", label: t("directory.allDepartments") },
            ...(departments.data ?? []).map((department) => ({
              value: String(department.id),
              label: department.name,
            })),
          ]}
        />
        <FilterSelect
          label={t("directory.status")}
          value={filters.status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "", label: t("directory.statusCurrent") },
            { value: "active", label: t("status.active") },
            { value: "suspended", label: t("status.suspended") },
            { value: "archived", label: t("status.archived") },
          ]}
        />
      </FilterBar>
      <DataTable
        label={title}
        columns={columns}
        sort={sort}
        onSort={setSort}
        rows={list.data?.results ?? []}
        rowKey={(row: EmployeeRow) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t("directory.empty.title")} hint={t("directory.empty.hint")} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
