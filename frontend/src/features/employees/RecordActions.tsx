import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { type EmployeeDetail, isFullRecord } from "./api";
import { DepartureSheet } from "./DepartureSheet";
import type { RecordMode } from "./recordTypes";

/** The actions of the record page. Only the HR desk has any: Edit (primary) and Record a departure. */
export function RecordActions({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const [leaving, setLeaving] = useState(false);
  if (mode !== "hr" || !isFullRecord(employee)) {
    return null;
  }
  const employed = employee.status !== "archived";
  return (
    <div className="flex flex-wrap gap-2">
      {employed ? (
        <Button type="button" onClick={() => setLeaving(true)}>
          {t("departure.action")}
        </Button>
      ) : null}
      <Button variant="primary" asChild>
        <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("record.edit")}</Link>
      </Button>
      {employed ? <DepartureSheet employee={employee} open={leaving} onOpenChange={setLeaving} /> : null}
    </div>
  );
}
