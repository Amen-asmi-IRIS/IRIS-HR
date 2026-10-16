import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { awayWithData, ProblemError } from "@/api/problem";
import { DataTable, FilterBar, NotAvailable, Pager, SomethingWentWrong, StatusBadge, useListParams, type Column } from "@/components";
import { useRequestList } from "../api";
import { useRequestsText, useWorkspacePrefix } from "../platform";
import { StatusSentence } from "../StatusSentence";
import { describeQuantity, describeWhen } from "../text";
import { TypeTag } from "../TypeTag";
import type { RequestListParams, RequestOut, Scope } from "../types";
import { usePendingActions } from "../undoable";
import { FILTER_DEFAULTS, RequestFilter, type FilterName } from "./filters";

export type ListColumn = "who" | "department" | "type" | "when" | "quantity" | "status";

const PAGE_SIZE = 25;

interface RequestsListProps {
  scope: Scope;
  /** At most six (M4). The first one opens the request and is shown as plain text. */
  columns: ListColumn[];
  /** At most three (M5); the others go in `moreFilters`. */
  filters: FilterName[];
  moreFilters?: FilterName[];
  /** Parameters the page imposes, whatever the filters say (for example one employee). */
  fixed?: Partial<RequestListParams>;
  empty: ReactNode;
  /** Something to add after the status sentence of a row, such as "Discard". */
  rowExtra?: (request: RequestOut) => ReactNode;
  /** The accessible name of the table. */
  label?: string;
  /**
   * The list sits in a page that holds sheets (an employee record): a later reading that fails only because the
   * application is away keeps the rows, so that the page and its open sheet stay (master 13.1).
   */
  keepWhileAway?: boolean;
}

/** A filterable, paged table of requests for any scope. Opening a row stays in the current workspace. */
export function RequestsList({
  scope,
  columns,
  filters,
  moreFilters = [],
  fixed,
  empty,
  rowExtra,
  label,
  keepWhileAway = false,
}: RequestsListProps) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const prefix = useWorkspacePrefix();
  const params = useListParams(FILTER_DEFAULTS);
  const pending = usePendingActions();
  const query = useRequestList({
    scope,
    ...params.filters,
    ...fixed,
    ordering: params.sort,
    page: params.page,
    page_size: PAGE_SIZE,
  });
  const lead = columns[0];
  // As Gate does: an outage goes to the shell's boundary, which says "being updated" and reads again by itself.
  const kept = keepWhileAway && awayWithData(query);
  if (!kept && query.error instanceof ProblemError && query.error.unavailable) throw query.error;
  const refused = !kept && query.error instanceof ProblemError && (query.error.status === 403 || query.error.status === 404);

  const cells: Record<ListColumn, Column<RequestOut>> = {
    who: { key: "who", header: t("common.who"), cell: (request) => request.employee.name },
    department: { key: "department", header: t("common.department"), cell: (request) => request.employee.department },
    type: {
      key: "type",
      header: t("common.type"),
      // As the first column it is the button that opens the row: plain text there, the coloured tag elsewhere.
      cell: (request) =>
        lead === "type" ? request.type.name : <TypeTag code={request.type.code} name={request.type.name} />,
    },
    when: { key: "when", header: t("common.dates"), cell: (request) => describeWhen(request, t, lang), sortBy: "start_date" },
    quantity: { key: "quantity", header: t("common.quantity"), cell: (request) => describeQuantity(request, lang) },
    status: {
      key: "status",
      header: t("common.status"),
      cell: (request) => (
        <div className="flex flex-wrap items-center gap-2">
          {pending.get(request.public_id) === "withdraw" ? (
            <StatusBadge tone="neutral">{t("status.requester.withdrawn")}</StatusBadge>
          ) : (
            <StatusSentence request={request} />
          )}
          {rowExtra?.(request)}
        </div>
      ),
    },
  };

  const rows = (query.data?.results ?? []).filter((request) => pending.get(request.public_id) !== "discard");
  const filter = (name: FilterName) => (
    <RequestFilter key={name} name={name} values={params.filters} set={params.setFilter} />
  );

  return (
    <div className="flex flex-col">
      <FilterBar more={moreFilters.length > 0 ? <>{moreFilters.map(filter)}</> : undefined}>{filters.map(filter)}</FilterBar>
      {refused ? (
        <NotAvailable />
      ) : query.isError && !kept ? (
        <SomethingWentWrong requestId={query.error instanceof ProblemError ? query.error.requestId : undefined} />
      ) : (
        <DataTable
          label={label}
          columns={columns.map((column) => cells[column])}
          sort={params.sort}
          onSort={params.setSort}
          rows={rows}
          rowKey={(request) => request.public_id}
          onRowOpen={(request) => navigate(`/${prefix}/requests/${request.public_id}`)}
          empty={empty}
          isLoading={query.isPending}
        />
      )}
      <Pager page={params.page} pageSize={PAGE_SIZE} total={query.data?.count ?? 0} onPage={params.setPage} />
    </div>
  );
}
