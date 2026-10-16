import { formatDate, formatDateRange, formatDays, formatHours } from "@/lib/format";
import { useRequestsText } from "../platform";
import type { DecisionContext, Unit } from "../types";

interface DecisionContextViewProps {
  context: DecisionContext | null;
  unit: Unit;
  /** On the request page: the balance now and after, and an explicit line when nobody else is away. */
  detailed?: boolean;
}

/**
 * What an approver needs in order to decide (UI 6.1, 6.2): the balance after, the limit usage,
 * the teammates already away on those days. All of it comes from the API; a null balance (a type
 * that does not use it, or balances not yet in service) simply shows no balance line.
 */
export function DecisionContextView({ context, unit, detailed = false }: DecisionContextViewProps) {
  const { t, lang } = useRequestsText();
  if (!context) return null;
  const amount = (value: string) => (unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  const lines: string[] = [];

  if (context.balance) {
    lines.push(
      detailed
        ? t("context.balanceNowAfter", {
            now: formatDays(context.balance.now, lang),
            after: formatDays(context.balance.after, lang),
          })
        : t("context.balanceAfter", { after: formatDays(context.balance.after, lang) }),
    );
  }
  if (context.cap) {
    lines.push(t("context.cap", { used: amount(context.cap.used), limit: amount(context.cap.limit) }));
  }
  if (context.teammates_away.length > 0) {
    const people = context.teammates_away
      .map((person) =>
        t(`context.person.${person.label}`, {
          name: person.name,
          when:
            person.start_date === person.end_date
              ? formatDate(person.start_date, lang)
              : formatDateRange(person.start_date, person.end_date, lang),
        }),
      )
      .join(" ; ");
    lines.push(t("context.away", { people }));
  } else if (detailed) {
    lines.push(t("context.nobodyAway"));
  }

  if (lines.length === 0) return null;
  return (
    <ul aria-label={t("context.title")} className="mt-3 flex flex-col gap-1 text-body text-text-secondary">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
