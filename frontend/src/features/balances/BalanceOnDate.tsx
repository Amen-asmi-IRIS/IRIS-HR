import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import { useBalanceOn } from "./api";

/** The balance on a date of the reader's choice: posted for the past, expected for the future. */
export function BalanceOnDate({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const id = useId();
  const [on, setOn] = useState("");
  const result = useBalanceOn(employeeId, on || undefined);
  const asOf = on ? (result.data?.as_of ?? null) : null;
  const problem = on && result.error instanceof ProblemError ? result.error : null;
  // An outage is the shell's to say; any other refusal is said next to the date.
  if (problem?.unavailable) throw problem;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor={id}>{t("onDate.label")}</Label>
        <Input
          id={id}
          type="date"
          value={on}
          onChange={(event) => setOn(event.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
        />
        {problem && (
          <p id={errorId} role="alert" className="text-caption text-destructive">
            {problem.errors.find((entry) => entry.field === "on")?.detail ?? problem.detail}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {asOf && !problem && (
          <>
            <p className="text-body font-semibold">
              {t(asOf.projected ? "onDate.projected" : "onDate.posted", {
                date: formatDate(asOf.date, lang),
                balance: formatDays(asOf.balance, lang),
              })}
            </p>
            {asOf.projected && <p className="text-caption text-muted-foreground">{t("onDate.projectedHint")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
