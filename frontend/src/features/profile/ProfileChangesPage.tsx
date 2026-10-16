import { useState } from "react";
import { useTranslation } from "react-i18next";

import { awayWithData } from "@/api/problem";
import { type Column, DataTable, EmptyState, PageHeader, Pager, useListParams } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useProfileChanges } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";
import { ProposalSheet } from "./ProposalSheet";

const PAGE_SIZE = 25;
const VIEWS = ["pending", "decided"] as const;

export default function ProfileChangesPage() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const { filters, page, setFilter, setPage } = useListParams({ view: "pending" });
  const view = filters.view === "decided" ? "decided" : "pending";
  const list = useProfileChanges({ scope: "all", status: view, page });
  const [openId, setOpenId] = useState<string | null>(null);

  // The page holds the sheet where HR writes a comment: while the application is only away it stays.
  if (list.error && !awayWithData(list)) {
    throw list.error;
  }
  const rows = list.data?.results ?? [];
  // Read the open proposal from the list, so the sheet follows a refresh.
  const open = rows.find((row) => row.public_id === openId) ?? null;

  const who: Column<ProfileChange> = {
    key: "who",
    header: t("queue.columns.who"),
    cell: (row: ProfileChange) => row.employee.name,
  };
  const fields: Column<ProfileChange> = {
    key: "fields",
    header: t("queue.columns.fields"),
    cell: (row: ProfileChange) => row.changes.map((item) => text.label(item.field)).join(", "),
  };
  const action: Column<ProfileChange> = {
    key: "action",
    header: t("queue.columns.action"),
    cell: (row: ProfileChange) => (
      <Button
        type="button"
        size="sm"
        aria-label={t("queue.openFor", { name: row.employee.name })}
        onClick={() => setOpenId(row.public_id)}
      >
        {t("queue.open")}
      </Button>
    ),
  };
  const columns: Column<ProfileChange>[] =
    view === "pending"
      ? [
          who,
          fields,
          {
            key: "when",
            header: t("queue.columns.when"),
            cell: (row: ProfileChange) => formatDateTime(row.created_at, lang),
          },
          action,
        ]
      : [
          who,
          fields,
          {
            key: "outcome",
            header: t("queue.columns.outcome"),
            cell: (row: ProfileChange) => <OutcomeBadge status={row.status} />,
          },
          {
            key: "decidedBy",
            header: t("queue.columns.decidedBy"),
            cell: (row: ProfileChange) => row.decided_by ?? "",
          },
          action,
        ];

  return (
    <>
      <PageHeader title={t("queue.title")} />
      <div role="tablist" aria-label={t("queue.title")} className="mb-4 inline-flex rounded-md bg-accent p-1">
        {VIEWS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setFilter("view", value)}
            className={`min-h-10 rounded px-4 text-body max-md:min-h-11 ${
              view === value ? "bg-card font-semibold text-foreground" : "font-medium text-accent-foreground"
            }`}
          >
            {t(`queue.tabs.${value}`)}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row: ProfileChange) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t(`queue.empty.${view}`)} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
      <ProposalSheet change={open} onClose={() => setOpenId(null)} />
    </>
  );
}
