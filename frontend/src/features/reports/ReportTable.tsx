import { useTranslation } from "react-i18next";
import { useLang, type Lang } from "@/i18n";
import type { ReportColumn, ReportData, ReportTotalLine } from "./api";
import { formatCell } from "./cells";

const CELL = "px-4 py-3 align-top";
const HEAD = "bg-muted px-4 py-2 text-caption font-medium text-muted-foreground";
const FRAME = "overflow-x-auto rounded-xl border border-border bg-card";

function alignment(column: ReportColumn): string {
  return column.kind === "number" ? "text-right" : "text-left";
}

interface ReportTableProps {
  data: ReportData;
  /** Names the result for assistive technology, for example "Résultat : Absences prises". */
  label: string;
}

export function ReportTable({ data, label }: ReportTableProps) {
  const { t } = useTranslation("reports");
  const lang = useLang();
  const lines = data.totals?.lines ?? [];
  const overall = lines.filter((line) => line.group === "overall");
  const [first, ...others] = data.columns;

  return (
    <>
      {/* A wide report scrolls sideways: the region takes the focus so that the keyboard can scroll it (WCAG 2.1.1). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div role="region" aria-label={label} tabIndex={0} className={FRAME}>
        <table className="w-full border-collapse text-body tabular">
          <thead>
            <tr>
              {data.columns.map((column) => (
                <th key={column.key} scope="col" className={`${HEAD} ${alignment(column)} whitespace-nowrap`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              // Rows of a report have no identity of their own: their position is their key.
              <tr key={index} className="border-t border-divider">
                {data.columns.map((column) => (
                  <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                    {formatCell(row[column.key], column.kind, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {overall.length > 0 && first && (
            <tfoot>
              {overall.map((line) => (
                <tr key={line.label} className="border-t border-border font-semibold">
                  <th scope="row" className={`${CELL} text-left`}>
                    {line.label}
                  </th>
                  {others.map((column) => (
                    <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                      {formatCell(line.values[column.key], column.kind, lang)}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {(["by_employee", "by_type"] as const).map((group) => (
        <TotalsGroup
          key={group}
          title={t(`totals.${group}`)}
          lines={lines.filter((line) => line.group === group)}
          columns={data.columns}
          lang={lang}
        />
      ))}
    </>
  );
}

interface TotalsGroupProps {
  title: string;
  lines: ReportTotalLine[];
  columns: ReportColumn[];
  lang: Lang;
}

function TotalsGroup({ title, lines, columns, lang }: TotalsGroupProps) {
  if (lines.length === 0) return null;
  const valued = columns.filter((column) => lines.some((line) => column.key in line.values));
  return (
    <div className={`${FRAME} mt-6`}>
      <table className="w-full border-collapse text-body tabular">
        <caption className="px-4 py-3 text-left text-section font-semibold">{title}</caption>
        <thead>
          <tr>
            <td className={HEAD} />
            {valued.map((column) => (
              <th key={column.key} scope="col" className={`${HEAD} ${alignment(column)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="border-t border-divider">
              <th scope="row" className={`${CELL} text-left font-normal`}>
                {line.label}
              </th>
              {valued.map((column) => (
                <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                  {formatCell(line.values[column.key], column.kind, lang)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
