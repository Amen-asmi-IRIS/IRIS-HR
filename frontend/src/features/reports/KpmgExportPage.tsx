import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { awayWithData, ProblemError, type FieldProblem } from "@/api/problem";
import { problemText } from "@/api/problemText";
import { Block } from "@/components/Block";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { downloadKpmg, useKpmgDefaultPeriod, useReportFilters, type KpmgQuery, type ReportQuery } from "./api";
import { toIsoDate, type FilterKey } from "./definitions";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";

export const KPMG_COLUMN_KEYS = [
  "employee_number",
  "name",
  "department",
  "annual_days",
  "sick_days",
  "exceptional_days",
  "permission_hours",
  "remote_days",
  "balance_end",
  "meal_tickets",
] as const;

const RULE_KEYS = ["approved", "period", "tickets"] as const;
const FILTERS: { visible: FilterKey[]; more: FilterKey[] } = {
  visible: ["period", "department", "employee"],
  more: ["type"],
};
const QUERY_NAMES = ["from", "to", "department", "employee", "type"] as const;

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "nothing"; detail: string }
  | { kind: "refused"; problems: FieldProblem[] };

/** The monthly file for KPMG (UI 7.11): one period, optional filters, one click. */
export default function KpmgExportPage() {
  const { t } = useTranslation("reports");
  const proposed = useKpmgDefaultPeriod();
  const options = useReportFilters("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  // A second click while the file is on its way exports nothing more.
  const busy = useRef(false);

  // What the address says, completed by the period the server proposes (REP-07).
  const query = useMemo(() => {
    const defaults: KpmgQuery = { from: proposed.data?.start, to: proposed.data?.end };
    const selected: KpmgQuery = {};
    for (const key of QUERY_NAMES) {
      const value = searchParams.get(key) ?? defaults[key];
      if (value) selected[key] = value;
    }
    return selected;
  }, [proposed.data, searchParams]);

  // The selection lives in the address; an outage while the page is open keeps it on screen (master 13.1).
  if (proposed.error && !awayWithData(proposed)) throw proposed.error;
  if (options.error && !awayWithData(options)) throw options.error;

  const change = (patch: ReportQuery) => {
    setOutcome({ kind: "idle" });
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const exportNow = async () => {
    if (busy.current) return;
    busy.current = true;
    setOutcome({ kind: "busy" });
    try {
      await downloadKpmg(query);
      setOutcome({ kind: "idle" });
      toast(t("kpmg.exported"));
    } catch (error) {
      if (error instanceof ProblemError && error.code === "reports.nothing_to_export") {
        setOutcome({ kind: "nothing", detail: error.detail });
      } else if (error instanceof ProblemError && error.status === 400) {
        setOutcome({ kind: "refused", problems: error.errors });
      } else {
        setOutcome({ kind: "idle" });
        // A session that has ended is already on its way to Sign in.
        if (!(error instanceof ProblemError && error.status === 401)) toast(problemText(error, t));
      }
    } finally {
      busy.current = false;
    }
  };

  const cutoffDay = proposed.data?.cutoff_day ?? null;
  // The annual balance at a period end that is today or later counts the month-end credits due by then (master 13.1).
  const notOver = query.to !== undefined && query.to >= toIsoDate(new Date());

  return (
    <>
      <PageHeader
        title={t("kpmg.title")}
        back="/hr/reports"
        primary={
          <Button variant="primary" onClick={exportNow} aria-busy={outcome.kind === "busy"}>
            {t("common:actions.export")}
          </Button>
        }
      >
        {t("kpmg.intro")}
      </PageHeader>

      <ReportFilters filters={FILTERS} options={options.data} values={query} onChange={change} />
      {proposed.data && (
        <p className="mb-4 text-caption text-muted-foreground">
          {cutoffDay === null ? t("kpmg.period_month") : t("kpmg.period_cutoff", { day: cutoffDay })}
        </p>
      )}
      {notOver && <p className="mb-4 text-body text-text-secondary">{t("kpmg.not_over")}</p>}
      {outcome.kind === "refused" && <ReportProblems problems={outcome.problems} />}
      {outcome.kind === "nothing" && (
        <div className="mb-4">
          <EmptyState title={t("kpmg.nothing_title")} hint={outcome.detail} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title={t("kpmg.columns_title")}>
          <ol aria-label={t("kpmg.columns_title")} className="m-0 grid list-decimal gap-1 pl-5 text-body">
            {KPMG_COLUMN_KEYS.map((key) => (
              <li key={key}>{t(`kpmg.columns.${key}`)}</li>
            ))}
          </ol>
        </Block>
        <Block title={t("kpmg.rules_title")}>
          <ul aria-label={t("kpmg.rules_title")} className="m-0 flex list-disc flex-col gap-2 pl-5 text-body">
            {RULE_KEYS.map((key) => (
              <li key={key}>{t(`kpmg.rules.${key}`)}</li>
            ))}
          </ul>
        </Block>
      </div>
    </>
  );
}
