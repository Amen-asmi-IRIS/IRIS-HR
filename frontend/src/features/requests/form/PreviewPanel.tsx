import { formatDate, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { useRequestsText } from "../platform";
import type { Preview, RequestTypeOut } from "../types";
import { chainSentence } from "./chain";

interface PreviewPanelProps {
  type: RequestTypeOut;
  /** Undefined until the server has something to say about the current values. */
  preview: Preview | undefined;
  mode: "me" | "hr";
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-section font-semibold" : "text-body"}>{value}</dd>
    </div>
  );
}

/** Everything the system worked out and the user is not asked for (U4). */
export function PreviewPanel({ type, preview, mode }: PreviewPanelProps) {
  const { t, lang } = useRequestsText();
  const amount = (value: string) => (type.unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  return (
    <aside aria-label={t("form.computed")} className="self-start rounded-xl border border-border bg-card px-6 py-5">
      <h2 className="text-section font-semibold">{t("form.computed")}</h2>
      {preview ? (
        <dl className="mt-3 flex flex-col gap-3">
          <Row label={t(type.unit === "hour" ? "form.hoursCounted" : "form.daysCounted")} value={amount(preview.quantity)} strong />
          {preview.skipped_days.length > 0 && (
            <Row
              label={t("form.notCounted")}
              value={preview.skipped_days
                .map((day) => t(`form.skipped.${day.reason}`, { date: formatDate(day.date, lang) }))
                .join(" · ")}
            />
          )}
          {preview.balance && (
            <>
              <Row label={t("form.balanceNow")} value={formatDays(preview.balance.now, lang)} />
              <Row label={t("form.balanceOnStart")} value={formatDays(preview.balance.on_start, lang)} />
              <Row label={t("form.balanceAfter")} value={formatDays(preview.balance.after, lang)} />
            </>
          )}
          {preview.usage.event_days_allowed && (
            <Row label={t("form.eventAllowed")} value={formatDays(preview.usage.event_days_allowed, lang)} />
          )}
          {preview.usage.month_hours && <Row label={t("form.monthHours")} value={formatHours(preview.usage.month_hours, lang)} />}
          {preview.usage.cap && (
            <Row
              label={t(`form.cap.${preview.usage.cap.period}`)}
              value={t("form.capValue", { used: amount(preview.usage.cap.used), limit: amount(preview.usage.cap.limit) })}
            />
          )}
          {preview.certificate_due_at && (
            <Row label={t("form.certificateDue")} value={formatDateTime(preview.certificate_due_at, lang)} />
          )}
          <Row label={t("form.whoDecides")} value={chainSentence(preview.chain, t, mode)} />
        </dl>
      ) : (
        <p className="mt-2 text-body text-muted-foreground">{t("form.computedEmpty")}</p>
      )}
      {type.is_sensitive && <p className="mt-3 text-caption text-muted-foreground">{t("form.sensitiveNote")}</p>}
    </aside>
  );
}
