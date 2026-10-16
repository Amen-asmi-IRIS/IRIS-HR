import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEvent } from "@/api/types";
import { DataTable, type Column } from "@/components/DataTable";
import { DownloadLink } from "@/components/DownloadLink";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { FilterDateRange, FilterSelect } from "@/components/filters";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { buttonVariants } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useAccounts } from "@/features/accounts/api";
import { useCurrentUser } from "@/features/auth/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { auditExportUrl, useAuditEvents, type AuditCategory } from "./api";
import { EventSheet } from "./EventSheet";
import { actionLabel, objectLabel, SECURITY_ACTIONS } from "./labels";

const PAGE_SIZE = 25;

export interface Option {
  value: string;
  label: string;
}

interface AuditLogPageProps {
  category: AuditCategory;
  /** People for the "who" filter. By default the accounts, when the reader may list them. */
  actors?: Option[];
  /** Kinds of event to filter on. By default the security actions, for the security log. */
  actionOptions?: Option[];
  /** Kinds of item to filter on, behind "More filters". */
  itemTypeOptions?: Option[];
}

/** The security log (UI 9.6) and the activity log (UI 7.11): the same page over two categories. */
export default function AuditLogPage({ category, actors, actionOptions, itemTypeOptions }: AuditLogPageProps) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const list = useListParams({ from: "", to: "", actor: "", action: "", object_type: "", object_id: "" });
  const [opened, setOpened] = useState<AuditEvent | null>(null);

  const mayListAccounts = (me.roles as readonly string[]).some((role) => role === "sysadmin" || role === "exec");
  const accounts = useAccounts({ page: 1, page_size: 100 }, actors === undefined && mayListAccounts);
  const people = actors ?? (accounts.data?.results ?? []).map((account) => ({ value: account.public_id, label: account.name }));
  const kinds = actionOptions ?? (category === "security" ? SECURITY_ACTIONS.map((action) => ({ value: action, label: actionLabel(action, t, i18n) })) : []);

  // A period typed backwards is read the right way round rather than refused.
  const { from, to } = list.filters;
  const filters = { ...list.filters, ...(from && to && from > to ? { from: to, to: from } : {}) };
  const query: Record<string, string | number> = { page: list.page, page_size: PAGE_SIZE };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  if (list.sort) query.ordering = list.sort;
  const events = useAuditEvents(category, query);

  if (events.error) throw events.error;

  const title = t(`audit:${category}.title`);
  const columns: Column<AuditEvent>[] = [
    { key: "at", header: t("audit:columns.when"), cell: (event) => formatDateTime(event.at, lang), sortBy: "at" },
    { key: "actor", header: t("audit:columns.who"), cell: (event) => event.actor ?? t("audit:system") },
    { key: "action", header: t("audit:columns.what"), cell: (event) => actionLabel(event.action, t, i18n), sortBy: "action" },
    { key: "object", header: t("audit:columns.on"), cell: (event) => objectLabel(event, t) },
    { key: "address", header: t("audit:columns.address"), cell: (event) => event.ip_address ?? "" },
  ];

  return (
    <>
      <PageHeader
        title={title}
        primary={
          <DownloadLink href={auditExportUrl(category, { ...filters, ...(list.sort ? { ordering: list.sort } : {}) })} download className={buttonVariants({ variant: "primary" })}>
            <Download aria-hidden="true" />
            {t("actions.export")}
          </DownloadLink>
        }
      />
      <FilterBar
        more={
          itemTypeOptions && itemTypeOptions.length > 0 ? (
            <FilterSelect
              label={t("audit:filters.itemType")}
              value={list.filters.object_type}
              onChange={(value) => list.setFilter("object_type", value)}
              options={[{ value: "", label: t("audit:filters.anyItemType") }, ...itemTypeOptions]}
            />
          ) : undefined
        }
      >
        <FilterDateRange
          label={t("audit:filters.period")}
          from={list.filters.from}
          to={list.filters.to}
          onFrom={(value) => list.setFilter("from", value)}
          onTo={(value) => list.setFilter("to", value)}
        />
        {people.length > 0 && (
          <FilterSelect
            label={t("audit:filters.actor")}
            value={list.filters.actor}
            onChange={(value) => list.setFilter("actor", value)}
            options={[{ value: "", label: t("audit:filters.anyActor") }, ...people]}
          />
        )}
        {kinds.length > 0 && (
          <FilterSelect
            label={t("audit:filters.action")}
            value={list.filters.action}
            onChange={(value) => list.setFilter("action", value)}
            options={[{ value: "", label: t("audit:filters.anyAction") }, ...kinds]}
          />
        )}
      </FilterBar>
      <DataTable
        label={title}
        columns={columns}
        sort={list.sort}
        onSort={list.setSort}
        rows={events.data?.results ?? []}
        rowKey={(event) => String(event.id)}
        onRowOpen={setOpened}
        isLoading={events.isPending}
        empty={<EmptyState title={t(`audit:${category}.empty`)} />}
      />
      <Pager page={list.page} pageSize={PAGE_SIZE} total={events.data?.count ?? 0} onPage={list.setPage} />
      <EventSheet event={opened} onClose={() => setOpened(null)} />
    </>
  );
}
