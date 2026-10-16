import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { awayWithData, ProblemError } from "@/api/problem";
import { DataTable, NotAvailable, SomethingWentWrong, type Column } from "@/components";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n";
import { formatDate, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { canSendBack } from "../decisions/DecisionSheet";
import { DocumentStatus } from "../DocumentStatus";
import { openStep } from "../hr/actions/ActionSheet";
import { useRequestsText, type Paginated } from "../platform";
import { describeQuantity, describeWhen } from "../text";
import { TypeTag } from "../TypeTag";
import type { ApprovalItem } from "../types";

export type QueueColumn =
  | "who" | "department" | "type" | "when" | "quantity" | "document" | "due" | "overdue" | "waitingOn" | "since";

/** A queue is read in one call: its hundred oldest rows. */
export const QUEUE_PAGE_SIZE = 100;

/** How long ago a certificate was due: whole hours under two days, whole days beyond. */
export function overdueBy(dueAt: string, now: Date, lang: Lang): string {
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(dueAt)) / 3_600_000));
  return hours < 48 ? formatHours(hours, lang) : formatDays(Math.floor(hours / 24), lang);
}

/** An action on a row of a queue. */
export function RowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

interface QueueTableProps {
  /** The accessible name of the table. */
  label: string;
  query: UseQueryResult<Paginated<ApprovalItem>>;
  /** The rows to show, when the page narrows what the server returned. */
  items?: ApprovalItem[];
  /** At most six (M4), "who" first: it opens the request. */
  columns: QueueColumn[];
  /** The actions of a row, shown under its last value. */
  actions: (item: ApprovalItem) => ReactNode;
  empty: ReactNode;
}

/** One of HR's queues as a table: what waits, with the actions that deal with it. */
export function QueueTable({ label, query, items, columns, actions, empty }: QueueTableProps) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  // Its pages open sheets over this reading: an outage after the rows are in keeps them, as Gate's `form` does.
  if (query.error && !awayWithData(query)) {
    const error = query.error;
    if (error instanceof ProblemError && (error.status === 403 || error.status === 404)) return <NotAvailable />;
    if (error instanceof ProblemError && error.unavailable) throw error;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }

  const received = query.data?.results ?? [];
  const now = new Date();

  const cells: Record<QueueColumn, { header: string; cell: (item: ApprovalItem) => ReactNode }> = {
    who: { header: t("common.who"), cell: (item) => item.request.employee.name },
    department: { header: t("common.department"), cell: (item) => item.request.employee.department },
    type: {
      header: t("common.type"),
      cell: ({ request }) => (
        <div className="flex flex-col items-start gap-1">
          <TypeTag code={request.type.code} name={request.type.name} />
          {/* The step waits on a change to an approved request: say which. */}
          {!canSendBack(request) && request.amendment && (
            <span className="text-caption text-muted-foreground">{t(`view.amendmentKind.${request.amendment.kind}`)}</span>
          )}
        </div>
      ),
    },
    when: { header: t("common.dates"), cell: (item) => describeWhen(item.request, t, lang) },
    quantity: { header: t("common.quantity"), cell: (item) => describeQuantity(item.request, lang) },
    document: { header: t("queues.columns.document"), cell: (item) => <DocumentStatus request={item.request} /> },
    due: {
      header: t("queues.columns.due"),
      cell: ({ request }) => (request.certificate?.due_at ? formatDateTime(request.certificate.due_at, lang) : "—"),
    },
    overdue: {
      header: t("queues.columns.overdue"),
      cell: ({ request }) =>
        request.certificate?.status === "overdue" && request.certificate.due_at
          ? overdueBy(request.certificate.due_at, now, lang)
          : t("queues.onTime"),
    },
    waitingOn: {
      header: t("queues.columns.waitingOn"),
      cell: (item) => openStep(item.request).waitingOn.join(", ") || t("queues.nobody"),
    },
    since: {
      header: t("queues.columns.since"),
      cell: (item) => (item.waiting_since ? formatDate(item.waiting_since, lang) : "—"),
    },
  };

  const last = columns[columns.length - 1];
  const tableColumns: Column<ApprovalItem>[] = columns.map((name) => ({
    key: name,
    header: cells[name].header,
    cell: (item) =>
      name === last ? (
        <div className="flex flex-col items-start gap-1 py-2">
          <div>{cells[name].cell(item)}</div>
          <div className="flex flex-wrap gap-1">{actions(item)}</div>
        </div>
      ) : (
        cells[name].cell(item)
      ),
  }));

  return (
    <>
      <DataTable
        label={label}
        columns={tableColumns}
        rows={items ?? received}
        rowKey={(item) => String(item.step_id)}
        onRowOpen={(item) => navigate(`/hr/requests/${item.request.public_id}`)}
        empty={empty}
        isLoading={query.isPending}
      />
      {(query.data?.count ?? 0) > received.length && (
        <p className="mt-2 text-caption text-muted-foreground">{t("queues.truncated", { n: received.length })}</p>
      )}
    </>
  );
}
