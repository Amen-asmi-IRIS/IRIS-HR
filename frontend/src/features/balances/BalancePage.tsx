import { useTranslation } from "react-i18next";

import { Disclosure, NotAvailable, PageHeader, PageLoading } from "@/components";
import { useCurrentUser } from "@/features/auth/api";

import { useBalance } from "./api";
import { BalanceOnDate } from "./BalanceOnDate";
import { BalanceSummary } from "./BalanceSummary";
import { LedgerTable } from "./LedgerTable";

/** My space, Balance (UI 5.6): the figure first, the date question and the history one step away. No action. */
export default function BalancePage() {
  const { t } = useTranslation("balances");
  const me = useCurrentUser();
  const employeeId = me.employee?.public_id;
  const balance = useBalance(employeeId);

  if (!employeeId) return <NotAvailable />;
  // A page that only shows what it reads says "being updated" rather than show old figures (master 13.1).
  if (balance.error) throw balance.error;
  if (!balance.data) return <PageLoading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <BalanceSummary balance={balance.data} />
      <div>
        <Disclosure title={t("onDate.title")}>
          <BalanceOnDate employeeId={employeeId} />
        </Disclosure>
        <Disclosure title={t("ledger.title")}>
          <LedgerTable employeeId={employeeId} />
        </Disclosure>
      </div>
    </div>
  );
}
