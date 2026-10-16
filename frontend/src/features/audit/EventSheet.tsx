import { useTranslation } from "react-i18next";
import type { AuditEvent } from "@/api/types";
import { TaskSheet } from "@/components/TaskSheet";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { actionLabel, objectLabel } from "./labels";

interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface EventSheetProps {
  event: AuditEvent | null;
  onClose: () => void;
}

/** One event: who, when, on what, the reference to quote, and the values before and after. */
export function EventSheet({ event, onClose }: EventSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = useLang();

  const text = (value: unknown): string => {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return t("audit:event.empty");
    if (typeof value === "boolean") return value ? t("state.yes") : t("state.no");
    if (Array.isArray(value)) return value.map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const rows: ChangeRow[] = event && isRecord(event.changes)
    ? Object.entries(event.changes).map(([field, value]) => {
        // A redacted field (a sick-leave comment) records that it changed, never its content.
        if (isRecord(value) && value.changed === true) return { field, before: "", after: t("audit:event.changed") };
        if (isRecord(value) && ("before" in value || "after" in value)) return { field, before: text(value.before), after: text(value.after) };
        return { field, before: "", after: text(value) };
      })
    : [];

  const facts: [string, string][] = event
    ? [
        [t("audit:columns.when"), formatDateTime(event.at, lang)],
        [t("audit:columns.who"), event.actor ?? t("audit:system")],
        [t("audit:columns.on"), objectLabel(event, t) || t("state.none")],
        [t("audit:columns.address"), event.ip_address ?? t("state.none")],
        [t("audit:event.reference"), event.request_id || t("state.none")],
      ]
    : [];

  return (
    <TaskSheet
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={event ? actionLabel(event.action, t, i18n) : t("audit:event.title")}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 break-words text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mb-2 mt-6 text-section font-semibold text-foreground">{t("audit:event.changes")}</h3>
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("audit:event.noChanges")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table aria-label={t("audit:event.changes")} className="w-full border-collapse text-body">
            <thead>
              <tr className="h-10 bg-muted text-caption font-medium text-muted-foreground">
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.field")}
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.before")}
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.after")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} className="border-t border-divider">
                  <th scope="row" className="tabular px-3 py-2 text-left font-medium text-text-secondary">
                    {row.field}
                  </th>
                  <td className="break-words px-3 py-2 text-foreground">{row.before}</td>
                  <td className="break-words px-3 py-2 text-foreground">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TaskSheet>
  );
}
