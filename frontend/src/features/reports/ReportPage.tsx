import { Download } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { ProblemError } from "@/api/problem";
import { DownloadLink } from "@/components/DownloadLink";
import { EmptyState } from "@/components/EmptyState";
import { NotAvailable } from "@/components/NotAvailable";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { buttonVariants } from "@/components/ui/button";
import { reportExportUrl, useReport, useReportFilters, type ReportQuery } from "./api";
import {
  defaultQuery,
  filtersFor,
  findReport,
  scopeOf,
  type FilterKey,
  type ReportDefinition,
  type ReportWorkspace,
} from "./definitions";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";
import { ReportTable } from "./ReportTable";

type QueryName = keyof ReportQuery;

function queryNames(keys: FilterKey[]): QueryName[] {
  return keys.flatMap((key): QueryName[] => (key === "period" ? ["from", "to"] : [key]));
}

interface ReportPageProps {
  workspace: ReportWorkspace;
  /** Defaults to the `:name` route parameter. */
  name?: string;
}

/** One report of UI 10.3: its filters, its result, its totals, and the download of what is shown. */
export default function ReportPage({ workspace, name }: ReportPageProps) {
  const params = useParams();
  const definition = findReport(name ?? params.name, workspace);
  if (!definition) return <NotAvailable />;
  return <ReportBody key={definition.name} definition={definition} workspace={workspace} />;
}

function ReportBody({ definition, workspace }: { definition: ReportDefinition; workspace: ReportWorkspace }) {
  const { t } = useTranslation("reports");
  const scope = scopeOf(workspace);
  const filters = useMemo(() => filtersFor(definition, workspace), [definition, workspace]);
  const [searchParams, setSearchParams] = useSearchParams();

  // What the address says, completed by the selection the report opens on.
  const query = useMemo(() => {
    const defaults = defaultQuery(definition, new Date());
    const selected: ReportQuery = {};
    for (const key of queryNames([...filters.visible, ...filters.more])) {
      const value = searchParams.get(key) ?? defaults[key];
      if (value) selected[key] = value;
    }
    return selected;
  }, [definition, filters, searchParams]);

  const options = useReportFilters(scope);
  const report = useReport(definition.name, scope, query);

  // A selection the server refuses is explained under the filters; anything else goes to the shell's boundary.
  const refused = report.error instanceof ProblemError && report.error.status === 400 ? report.error : null;
  if (report.error && !refused) throw report.error;

  const change = (patch: ReportQuery) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const title = t(`names.${definition.name}`);
  const data = refused ? undefined : report.data;
  const hasRows = data !== undefined && data.rows.length > 0;

  return (
    <>
      <PageHeader
        title={title}
        back={`/${workspace}/reports`}
        primary={
          hasRows ? (
            <DownloadLink href={reportExportUrl(definition.name, scope, query)} download className={buttonVariants({ variant: "primary" })}>
              <Download aria-hidden="true" />
              {t("common:actions.export")}
            </DownloadLink>
          ) : undefined
        }
      >
        {workspace === "team" ? t("team_note") : undefined}
      </PageHeader>
      <ReportFilters filters={filters} options={options.data} values={query} onChange={change} />
      <ReportProblems problems={refused?.errors ?? []} />
      {report.isPending && <PageLoading />}
      {data !== undefined && !hasRows && <EmptyState title={t("empty.title")} hint={t("empty.hint")} />}
      {hasRows && <ReportTable data={data} label={t("table_label", { name: title })} />}
      {hasRows && data.notes.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 text-body text-text-secondary">
          {data.notes.map((note) => (
            <p key={note} className="m-0">
              {note}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
