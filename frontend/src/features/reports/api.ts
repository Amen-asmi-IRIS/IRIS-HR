import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, call, download } from "@/api/client";
import type { ReportName, ReportOut, ReportQueryParams } from "@/api/types";

export type ReportScope = "team" | "all";
export type ReportColumn = ReportOut["columns"][number];
export type ColumnKind = ReportColumn["kind"];

/** One cell. The generated schema can only say "any value"; the API sends one of these (plan 06, Task 4). */
export type ReportCell = string | number | null | { start: string; end: string };

export interface ReportTotalLine {
  group: "overall" | "by_employee" | "by_type";
  label: string;
  values: Record<string, ReportCell>;
}

export type ReportData = Omit<ReportOut, "rows" | "totals"> & {
  rows: Record<string, ReportCell>[];
  totals: { lines: ReportTotalLine[] } | null;
};

/** The filters of a report as they stand in the address: query names, text values. */
export type ReportQuery = Partial<Record<"from" | "to" | "on" | "year" | "department" | "employee" | "type" | "step", string>>;
export type KpmgQuery = Partial<Record<"from" | "to" | "department" | "employee" | "type", string>>;

export const reportKeys = {
  all: ["reports"] as const,
  filters: (scope: ReportScope) => ["reports", "filters", scope] as const,
  run: (name: ReportName, scope: ReportScope, query: ReportQuery) => ["reports", "run", name, scope, query] as const,
  kpmgDefault: ["reports", "kpmg", "default-period"] as const,
};

export function useReportFilters(scope: ReportScope) {
  return useQuery({
    queryKey: reportKeys.filters(scope),
    queryFn: () => call(api.GET("/api/v1/report-filters", { params: { query: { scope } } })),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReport(name: ReportName, scope: ReportScope, query: ReportQuery) {
  return useQuery({
    queryKey: reportKeys.run(name, scope, query),
    queryFn: async () => {
      const params = { path: { name }, query: { ...query, scope } as ReportQueryParams };
      return (await call(api.GET("/api/v1/reports/{name}", { params }))) as unknown as ReportData;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}

function search(query: Record<string, string | undefined>): URLSearchParams {
  const found = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) found.set(key, value);
  }
  return found;
}

/** The address of the workbook of a report, for its download link (`DownloadLink`). The API records each export. */
export function reportExportUrl(name: ReportName, scope: ReportScope, query: ReportQuery): string {
  const found = search(query);
  found.set("scope", scope);
  found.set("format", "xlsx");
  return `/api/v1/reports/${name}?${found.toString()}`;
}

export function useKpmgDefaultPeriod() {
  return useQuery({
    queryKey: reportKeys.kpmgDefault,
    queryFn: () => call(api.GET("/api/v1/exports/kpmg/default-period")),
  });
}

export function kpmgExportUrl(query: KpmgQuery): string {
  const found = search(query).toString();
  return `/api/v1/exports/kpmg${found ? `?${found}` : ""}`;
}

/**
 * Fetches the KPMG workbook and hands it to the browser under the name the API gives it. It is fetched rather
 * than linked, because "nothing to export" and a wrong period must be said on the page: a refusal is thrown as
 * a ProblemError, and a session that has ended leads to Sign in and back, as `download` does for every file.
 */
export function downloadKpmg(query: KpmgQuery): Promise<void> {
  return download(kpmgExportUrl(query));
}
