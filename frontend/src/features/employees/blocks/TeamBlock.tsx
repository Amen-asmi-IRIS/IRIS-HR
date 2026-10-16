import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { useDelegations } from "@/features/delegations/api";
import { DelegationSheet } from "@/features/delegations/DelegationSheet";
import { DelegationStateBadge } from "@/features/delegations/DelegationStateBadge";
import { EndDelegationButton } from "@/features/delegations/EndDelegationButton";
import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, useEmployees } from "../api";
import type { RecordMode } from "../recordTypes";

export function TeamBlock({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  const base = mode === "hr" ? "/hr/employees" : "/overview/people";
  const reports = useEmployees({ scope: "all", manager: employee.public_id });
  // Only HR may list the delegations of someone else.
  const delegations = useDelegations({ scope: "all", manager: employee.public_id }, mode === "hr");
  const people = reports.data?.results ?? [];
  const current = (delegations.data?.results ?? []).filter(
    (row) => row.state === "active" || row.state === "upcoming",
  );
  const linkClass = "text-primary underline-offset-4 hover:underline";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="text-body font-semibold">{t("team.reports")}</h3>
        {people.length === 0 ? (
          <p className="text-body text-muted-foreground">{t("team.noReports")}</p>
        ) : (
          <ul className="grid gap-1">
            {people.map((person) => (
              <li key={person.public_id} className="text-body">
                <Link className={linkClass} to={`${base}/${person.public_id}`}>
                  {person.name}
                </Link>
                <span className="text-muted-foreground"> · {person.position.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "hr" ? (
        <div className="grid gap-2">
          <h3 className="text-body font-semibold">{t("team.delegation")}</h3>
          {current.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("team.noDelegation")}</p>
          ) : (
            <ul className="grid gap-2">
              {current.map((row) => (
                <li key={row.public_id} className="flex flex-wrap items-center gap-3 text-body">
                  <span>
                    {t("team.delegationLine", {
                      name: row.delegate.name,
                      start: formatDate(row.start_date, lang),
                      end: formatDate(row.end_date, lang),
                    })}
                  </span>
                  <DelegationStateBadge state={row.state} />
                  <EndDelegationButton delegation={row} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("team.changeManager")}</Link>
            </Button>
            {people.length > 0 ? (
              <Button type="button" size="sm" onClick={() => setSheetOpen(true)}>
                {t("team.nameDelegate")}
              </Button>
            ) : null}
          </div>
          <DelegationSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            manager={{ public_id: employee.public_id, name: employee.name }}
          />
        </div>
      ) : null}
    </div>
  );
}
