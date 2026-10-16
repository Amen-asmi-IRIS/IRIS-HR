import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { awayWithData } from "@/api/problem";
import { type Column, DataTable, EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type Delegation, useDelegations } from "./api";
import { DelegationSheet } from "./DelegationSheet";
import { DelegationStateBadge } from "./DelegationStateBadge";
import { EndDelegationButton } from "./EndDelegationButton";

export default function DelegationsPage() {
  const { t } = useTranslation("delegations");
  const lang = useLang();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const [sheetOpen, setSheetOpen] = useState(Boolean(from && to));
  const list = useDelegations({ scope: "mine" });

  if (list.error && !awayWithData(list)) {
    throw list.error;
  }
  const rows = list.data?.results ?? [];
  const given = rows.filter((row) => row.direction === "given");
  const received = rows.filter((row) => row.direction === "received");

  const period: Column<Delegation>[] = [
    {
      key: "from",
      header: t("columns.from"),
      cell: (row: Delegation) => formatDate(row.start_date, lang),
    },
    { key: "to", header: t("columns.to"), cell: (row: Delegation) => formatDate(row.end_date, lang) },
    {
      key: "state",
      header: t("columns.state"),
      cell: (row: Delegation) => <DelegationStateBadge state={row.state} />,
    },
  ];
  const givenColumns: Column<Delegation>[] = [
    { key: "delegate", header: t("columns.delegate"), cell: (row: Delegation) => row.delegate.name },
    ...period,
    // The column exists only when at least one delegation can still be ended.
    ...(given.some((row) => row.can_end)
      ? [
          {
            key: "action",
            header: t("columns.action"),
            cell: (row: Delegation) => <EndDelegationButton delegation={row} />,
          },
        ]
      : []),
  ];
  const receivedColumns: Column<Delegation>[] = [
    { key: "manager", header: t("columns.manager"), cell: (row: Delegation) => row.manager.name },
    ...period,
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          <Button variant="primary" type="button" onClick={() => setSheetOpen(true)}>
            {t("name")}
          </Button>
        }
      />

      <section aria-labelledby="delegations-given" className="grid gap-3">
        <h2 id="delegations-given" className="text-section font-semibold">
          {t("given.title")}
        </h2>
        <DataTable
          columns={givenColumns}
          rows={given}
          rowKey={(row: Delegation) => row.public_id}
          isLoading={list.isPending}
          empty={<EmptyState title={t("given.empty.title")} hint={t("given.empty.hint")} />}
        />
      </section>

      <section aria-labelledby="delegations-received" className="mt-8 grid gap-3">
        <h2 id="delegations-received" className="text-section font-semibold">
          {t("received.title")}
        </h2>
        {received.length > 0 ? (
          <DataTable
            columns={receivedColumns}
            rows={received}
            rowKey={(row: Delegation) => row.public_id}
            isLoading={false}
            empty={null}
          />
        ) : (
          <p className="text-body text-muted-foreground">{t("received.empty")}</p>
        )}
      </section>

      <DelegationSheet open={sheetOpen} onOpenChange={setSheetOpen} defaultStart={from} defaultEnd={to} />
    </>
  );
}
