import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { awayWithData, ProblemError } from "@/api/problem";
import { DataTable, EmptyState, NotAvailable, Pager, SomethingWentWrong } from "@/components";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import { useLedger, type LedgerLine } from "./api";
import { formatSigned } from "./format";

const PAGE_SIZE = 25;

const KINDS = ["opening", "credit", "taken", "restored", "adjustment"];

function Behind({ line, label }: { line: LedgerLine; label: string }) {
  return (
    <span className="flex flex-col gap-1">
      {line.request_public_id && (
        <Link className="text-primary underline-offset-4 hover:underline" to={`/requests/${line.request_public_id}`}>
          {label}
        </Link>
      )}
      {line.reason && <span>{line.reason}</span>}
    </span>
  );
}

interface LedgerTableProps {
  employeeId: string;
  /**
   * The table sits in a page that opens sheets (the employee record): a re-reading that fails only because the
   * application is away keeps the lines on screen instead of taking the page and its sheet away (master 13.1).
   */
  keepWhileAway?: boolean;
}

/** The history of one employee's balance, newest first: five attributes per line. */
export function LedgerTable({ employeeId, keepWhileAway = false }: LedgerTableProps) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const ledger = useLedger(employeeId, page);

  const kept = keepWhileAway && awayWithData(ledger);
  if (!kept && ledger.error instanceof ProblemError && ledger.error.unavailable) throw ledger.error;
  if (ledger.isError && !kept) {
    const error = ledger.error;
    if (error instanceof ProblemError && (error.status === 403 || error.status === 404)) return <NotAvailable />;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }

  const columns = [
    { key: "date", header: t("ledger.date"), cell: (line: LedgerLine) => formatDate(line.effective_date, lang) },
    {
      key: "what",
      header: t("ledger.what"),
      cell: (line: LedgerLine) => t(`kind.${KINDS.includes(line.kind) ? line.kind : "adjustment"}`),
    },
    {
      key: "amount",
      header: t("ledger.amount"),
      align: "end" as const,
      cell: (line: LedgerLine) => formatSigned(line.amount, lang),
    },
    {
      key: "after",
      header: t("ledger.after"),
      align: "end" as const,
      cell: (line: LedgerLine) => formatDays(line.balance_after, lang),
    },
    {
      key: "why",
      header: t("ledger.why"),
      cell: (line: LedgerLine) => <Behind line={line} label={t("ledger.request")} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        label={t("ledger.title")}
        columns={columns}
        rows={ledger.data?.results ?? []}
        rowKey={(line: LedgerLine) => String(line.id)}
        empty={<EmptyState title={t("ledger.empty")} hint={t("ledger.emptyHint")} />}
        isLoading={ledger.isPending}
      />
      {/* Plan 01b's Pager renders nothing when one page is enough. */}
      <Pager page={page} pageSize={PAGE_SIZE} total={ledger.data?.count ?? 0} onPage={setPage} />
    </div>
  );
}
