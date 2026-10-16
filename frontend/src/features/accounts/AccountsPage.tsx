import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { Account } from "@/api/types";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { FilterSelect, FilterText } from "@/components/filters";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { AccountState } from "./AccountState";
import { useAccounts } from "./api";
import { ASSIGNABLE_ROLES } from "./createAccountForm";

const PAGE_SIZE = 25;
const STATES = ["active", "awaiting_first_sign_in", "locked", "disabled"] as const;

/** Who has access, and in what state (UI 9.2). */
export default function AccountsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const list = useListParams({ search: "", state: "", role: "" });
  const accounts = useAccounts({ ...list.query, page_size: PAGE_SIZE });

  if (accounts.error) throw accounts.error;

  const create = readOnly ? undefined : (
    <Button asChild variant="primary">
      <Link to="new">{t("accounts:list.create")}</Link>
    </Button>
  );

  const columns: Column<Account>[] = [
    { key: "name", header: t("accounts:list.name"), cell: (account) => account.name, sortBy: "name" },
    { key: "email", header: t("accounts:list.email"), cell: (account) => account.email, sortBy: "email" },
    { key: "state", header: t("accounts:list.state"), cell: (account) => <AccountState state={account.state} /> },
    {
      key: "roles",
      header: t("accounts:list.roles"),
      cell: (account) => (account.roles.length > 0 ? account.roles.map((role) => t(`roles.${role}`)).join(", ") : t("accounts:list.noRole")),
    },
    {
      key: "last",
      header: t("accounts:list.lastSignIn"),
      cell: (account) => (account.last_login_at ? formatDateTime(account.last_login_at, lang) : t("state.never")),
      sortBy: "last_login_at",
    },
  ];

  return (
    <>
      <PageHeader title={t("accounts:list.title")} primary={create} />
      <FilterBar>
        <FilterText label={t("accounts:list.search")} value={list.filters.search} onChange={(value) => list.setFilter("search", value)} />
        <FilterSelect
          label={t("accounts:list.state")}
          value={list.filters.state}
          onChange={(value) => list.setFilter("state", value)}
          options={[{ value: "", label: t("accounts:list.allStates") }, ...STATES.map((state) => ({ value: state, label: t(`accounts:states.${state}`) }))]}
        />
        <FilterSelect
          label={t("accounts:list.roles")}
          value={list.filters.role}
          onChange={(value) => list.setFilter("role", value)}
          options={[{ value: "", label: t("accounts:list.allRoles") }, ...ASSIGNABLE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))]}
        />
      </FilterBar>
      <DataTable
        label={t("accounts:list.title")}
        columns={columns}
        sort={list.sort}
        onSort={list.setSort}
        rows={accounts.data?.results ?? []}
        rowKey={(account) => account.public_id}
        onRowOpen={(account) => navigate(account.public_id)}
        isLoading={accounts.isPending}
        empty={
          <EmptyState
            title={t("accounts:list.empty")}
            hint={readOnly ? undefined : t("accounts:list.emptyHint")}
            action={
              readOnly ? undefined : (
                <Button asChild>
                  <Link to="new">{t("accounts:list.create")}</Link>
                </Button>
              )
            }
          />
        }
      />
      <Pager page={list.page} pageSize={PAGE_SIZE} total={accounts.data?.count ?? 0} onPage={list.setPage} />
    </>
  );
}
