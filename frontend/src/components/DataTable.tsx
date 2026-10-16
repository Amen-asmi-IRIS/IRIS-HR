import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Fragment, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PageLoading } from "./PageLoading";
import { useIsPhone } from "./useIsPhone";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  /** The `ordering` value of the API that sorts by this column, ascending ("name"); "-name" is descending. */
  sortBy?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the first column becomes the button that opens the row; its cell must be plain text. */
  onRowOpen?: (row: T) => void;
  /** What to show when there is no row: why, and the action that would fill the list. */
  empty: ReactNode;
  isLoading?: boolean;
  /** Accessible name of the table. */
  label?: string;
  /** The current `ordering` ("", "name" or "-name"), as `useListParams().sort` gives it. */
  sort?: string;
  /** When given, each column with `sortBy` can sort the list. Pass `useListParams().setSort`. */
  onSort?: (next: string) => void;
}

type Direction = "ascending" | "descending" | "none";

function directionOf(column: { sortBy?: string }, sort: string | undefined): Direction {
  if (!column.sortBy) return "none";
  if (sort === column.sortBy) return "ascending";
  if (sort === `-${column.sortBy}`) return "descending";
  return "none";
}

export function DataTable<T>({ columns, rows, rowKey, onRowOpen, empty, isLoading = false, label, sort, onSort }: DataTableProps<T>) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const sortId = useId();
  if (columns.length > 6) throw new Error("A list shows at most six attributes per item (UI rule M4).");
  if (isLoading) return <PageLoading />;
  if (rows.length === 0 || columns.length === 0) return <>{empty}</>;

  const [first, ...others] = columns;
  const sortable = onSort ? columns.filter((column) => column.sortBy) : [];
  const lead = (row: T) =>
    onRowOpen ? (
      // At least 44px high, so that a phone card's name can be touched (design README).
      <button type="button" onClick={() => onRowOpen(row)} className="min-h-11 cursor-pointer text-left font-semibold text-primary hover:underline">
        {first.cell(row)}
      </button>
    ) : (
      <span className="font-semibold text-foreground">{first.cell(row)}</span>
    );

  if (phone) {
    return (
      <>
        {sortable.length > 0 && (
          // A phone card has no column header: the same sorts are one choice above the cards.
          <div className="mb-3 flex min-h-11 items-center gap-2 text-body text-text-secondary">
            <label htmlFor={sortId}>{t("list.sort.label")}</label>
            <select
              id={sortId}
              value={sort ?? ""}
              onChange={(event) => onSort?.(event.target.value)}
              className="min-h-11 flex-1 rounded-md border border-input bg-card px-3 text-foreground"
            >
              <option value="">{t("list.sort.usual")}</option>
              {sortable.map((column) => (
                <Fragment key={column.key}>
                  <option value={column.sortBy}>{t("list.sort.ascending", { column: column.header })}</option>
                  <option value={`-${column.sortBy}`}>{t("list.sort.descending", { column: column.header })}</option>
                </Fragment>
              ))}
            </select>
          </div>
        )}
        <ul aria-label={label} className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={rowKey(row)} className="rounded-xl border border-border bg-card p-4">
              <div className="flex min-h-11 items-center text-body">{lead(row)}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
                {others.map((column) => (
                  <Fragment key={column.key}>
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd className="m-0 text-right text-foreground">{column.cell(row)}</dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table aria-label={label} className="w-full border-collapse text-body">
        <thead>
          <tr className="h-10 bg-muted text-caption font-medium text-muted-foreground">
            {columns.map((column) => {
              const alignment = cn("px-4 font-medium", column.align === "end" ? "text-right" : "text-left");
              if (!onSort || !column.sortBy) {
                return (
                  <th key={column.key} scope="col" className={alignment}>
                    {column.header}
                  </th>
                );
              }
              const direction = directionOf(column, sort);
              const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
              // A first click sorts ascending, a second descending, a third ascending again.
              const next = direction === "ascending" ? `-${column.sortBy}` : column.sortBy;
              return (
                <th key={column.key} scope="col" aria-sort={direction} className={alignment}>
                  <button
                    type="button"
                    title={t("list.sort.hint")}
                    onClick={() => onSort(next)}
                    className={cn("inline-flex h-10 cursor-pointer items-center gap-1 font-medium hover:text-foreground", direction !== "none" && "text-foreground")}
                  >
                    {column.header}
                    <Icon aria-hidden="true" className="size-3.5" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-15 border-t border-divider hover:bg-muted">
              <td className="px-4">{lead(row)}</td>
              {others.map((column) => (
                <td key={column.key} className={cn("px-4 text-foreground", column.align === "end" && "text-right")}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
