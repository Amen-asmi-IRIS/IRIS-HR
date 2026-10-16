import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { AdminStatus } from "@/api/types";
import { Block } from "@/components/Block";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdminStatus } from "./api";

type Job = AdminStatus["jobs"][number];
type Person = AdminStatus["accounts"]["locked"][number];

const PARTS = ["app", "database", "worker"] as const;

/** The home of Administration: is the system working, and who cannot get in? (UI 9.1) */
export default function StatusPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const status = useAdminStatus();

  const header = (
    <PageHeader
      title={t("accounts:status.title")}
      primary={
        readOnly ? undefined : (
          <Button asChild variant="primary">
            <Link to="/admin/accounts/new">{t("accounts:status.createAccount")}</Link>
          </Button>
        )
      }
    />
  );

  if (status.isPending) {
    return (
      <>
        {header}
        <PageLoading />
      </>
    );
  }
  if (status.error) throw status.error;

  const { health, accounts, jobs, backup } = status.data;
  const failing = PARTS.filter((part) => health[part] !== "ok");

  const jobName = (name: string) => {
    const key = `accounts:status.jobs.names.${name}`;
    return i18n.exists(key) ? t(key) : name;
  };
  const jobResult = (job: Job): ReactNode => {
    if (job.last_ok === true) return <StatusBadge tone="approved">{t("accounts:status.jobs.ok")}</StatusBadge>;
    if (job.last_ok === false) {
      return <StatusBadge tone="refused">{job.last_detail ? t("accounts:status.jobs.failedWith", { detail: job.last_detail }) : t("accounts:status.jobs.failed")}</StatusBadge>;
    }
    return <StatusBadge tone="neutral">{t("accounts:status.jobs.never")}</StatusBadge>;
  };
  const jobColumns: Column<Job>[] = [
    { key: "name", header: t("accounts:status.jobs.name"), cell: (job) => jobName(job.name) },
    { key: "last", header: t("accounts:status.jobs.lastRun"), cell: (job) => (job.last_finished_at ? formatDateTime(job.last_finished_at, lang) : t("state.never")) },
    { key: "result", header: t("accounts:status.jobs.result"), cell: jobResult },
    { key: "next", header: t("accounts:status.jobs.nextRun"), cell: (job) => (job.next_run_at ? formatDateTime(job.next_run_at, lang) : t("state.none")) },
  ];

  const groups: { label: string; people: Person[]; linked: boolean }[] = [
    { label: t("accounts:status.attention.locked"), people: accounts.locked, linked: true },
    { label: t("accounts:status.attention.awaiting"), people: accounts.awaiting_first_sign_in, linked: true },
    { label: t("accounts:status.attention.expired"), people: accounts.temp_expired, linked: true },
    // These are employees, not accounts: there is nothing to open yet.
    { label: t("accounts:status.attention.withoutAccount"), people: accounts.employees_without_account, linked: false },
  ].filter((group) => group.people.length > 0);

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title={t("accounts:status.health.title")}>
          {failing.length === 0 ? (
            <StatusBadge tone="approved">{t("accounts:status.health.ok")}</StatusBadge>
          ) : (
            <StatusBadge tone="refused">
              {t("accounts:status.health.failing", { parts: failing.map((part) => t(`accounts:status.health.parts.${part}`)).join(", ") })}
            </StatusBadge>
          )}
          <p className="mt-3 text-body text-muted-foreground">
            {t("accounts:status.health.version", { version: health.version, environment: t(`accounts:status.health.environments.${health.environment}`) })}
          </p>
        </Block>

        <Block title={t("accounts:status.attention.title")}>
          {groups.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("accounts:status.attention.none")}</p>
          ) : (
            <dl className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <dt className="text-caption font-medium text-muted-foreground">{group.label}</dt>
                  <dd className="m-0 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body text-foreground">
                    {group.people.map((person) =>
                      group.linked && !readOnly ? (
                        <Link key={person.public_id} to={`/admin/accounts/${person.public_id}`} className="font-semibold text-primary hover:underline">
                          {person.name}
                        </Link>
                      ) : (
                        <span key={person.public_id}>{person.name}</span>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Block>

        <div className="lg:col-span-2">
          <Block title={t("accounts:status.jobs.title")}>
            <DataTable
              label={t("accounts:status.jobs.title")}
              columns={jobColumns}
              rows={jobs}
              rowKey={(job) => job.name}
              empty={<p className="text-body text-muted-foreground">{t("accounts:status.jobs.none")}</p>}
            />
          </Block>
        </div>

        <div className="lg:col-span-2">
          <Block title={t("accounts:status.backup.title")}>
            {backup ? (
              <div className="flex flex-col gap-1 text-body text-foreground">
                <p>{t("accounts:status.backup.last", { when: formatDateTime(backup.last_at, lang) })}</p>
                {backup.size_bytes !== null && <p>{t("accounts:status.backup.size", { size: formatBytes(backup.size_bytes, lang) })}</p>}
                {backup.storage_used_bytes !== null && (
                  <p className="text-muted-foreground">{t("accounts:status.backup.storage", { size: formatBytes(backup.storage_used_bytes, lang) })}</p>
                )}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">{t("accounts:status.backup.none")}</p>
            )}
          </Block>
        </div>
      </div>
    </>
  );
}
