import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { RecordMode } from "@/features/employees/recordBlocks";
import { Gate } from "@/features/requests/Gate";

import { AdjustBalanceSheet } from "./AdjustBalanceSheet";
import { useBalance, type AdjustmentKind } from "./api";
import { BalanceSummary } from "./BalanceSummary";
import { LedgerTable } from "./LedgerTable";

/**
 * The Balance block of an employee record: figures, history and, for HR only, the two actions. Both are secondary
 * buttons: the record's one primary action stays "Edit" (UI 7.9). In `team` and `overview` mode no action is drawn.
 */
export function BalanceBlock({ employeeId, mode }: { employeeId: string; mode: RecordMode }) {
  const { t } = useTranslation("balances");
  const balance = useBalance(employeeId);
  const [sheet, setSheet] = useState<AdjustmentKind | null>(null);

  return (
    // `form`: the block holds the adjustment sheet, which keeps what was typed while the application is away.
    <Gate query={balance} form>
      {(figures) => (
        <div className="flex flex-col gap-4">
          <BalanceSummary balance={figures} compact />
          {mode === "hr" && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setSheet("adjustment")}>
                {t("block.adjust")}
              </Button>
              {/* The server says whether one may still be entered: none yet, and hired before credits start (D50). */}
              {figures.can_enter_opening && (
                <Button type="button" variant="secondary" onClick={() => setSheet("opening")}>
                  {t("block.opening")}
                </Button>
              )}
            </div>
          )}
          <LedgerTable employeeId={employeeId} keepWhileAway />
          {sheet && (
            <AdjustBalanceSheet
              employeeId={employeeId}
              kind={sheet}
              open
              onOpenChange={(open) => {
                if (!open) setSheet(null);
              }}
            />
          )}
        </div>
      )}
    </Gate>
  );
}
