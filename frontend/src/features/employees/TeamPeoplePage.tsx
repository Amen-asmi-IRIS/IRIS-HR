import { useTranslation } from "react-i18next";

import { type Column, DataTable, EmptyState, PageHeader, Pager, useListParams } from "@/components";

import { type EmployeeRow, useEmployees } from "./api";
import { PEOPLE_COLUMNS } from "./peopleColumns";

const PAGE_SIZE = 25;

/** My team, People: the people the manager is responsible for, directly or through a delegation. */
export default function TeamPeoplePage() {
  const { t } = useTranslation("employees");
  const { page, setPage } = useListParams({});
  const list = useEmployees({ scope: "team", page });

  if (list.error) {
    throw list.error;
  }

  const columns: Column<EmployeeRow>[] = [...PEOPLE_COLUMNS]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({ key: column.id, header: t(column.headerKey), cell: column.cell }));

  return (
    <>
      <PageHeader title={t("people.title")} />
      <DataTable
        label={t("people.title")}
        columns={columns}
        rows={list.data?.results ?? []}
        rowKey={(row: EmployeeRow) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t("people.empty.title")} hint={t("people.empty.hint")} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
