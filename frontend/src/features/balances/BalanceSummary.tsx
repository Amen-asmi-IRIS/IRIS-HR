import { useTranslation } from "react-i18next";

import { Figure } from "@/components";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import type { Balance } from "./api";

interface Props {
  balance: Balance;
  /** In a block of the employee record the balance is a line of text, not the page's one large figure. */
  compact?: boolean;
}

export function BalanceSummary({ balance, compact = false }: Props) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const current = formatDays(balance.current, lang);

  return (
    <section aria-label={t("current")} className="rounded-xl border bg-card px-6 py-5">
      {compact ? (
        <p className="text-section font-semibold" data-figure>
          {current}
        </p>
      ) : (
        <Figure value={current} label={t("current")} />
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">{t("pending")}</dt>
          <dd className="text-body font-semibold">{formatDays(balance.pending, lang)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">{t("approvedUpcoming")}</dt>
          <dd className="text-body font-semibold">{formatDays(balance.approved_upcoming, lang)}</dd>
        </div>
        {balance.next_credit_amount !== null && balance.next_credit_date !== null && (
          <div>
            <dt className="text-caption text-muted-foreground">{t("nextCredit")}</dt>
            <dd className="text-body font-semibold">
              {t("nextCreditValue", {
                amount: formatDays(balance.next_credit_amount, lang),
                date: formatDate(balance.next_credit_date, lang),
              })}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
