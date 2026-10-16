import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { type EmployeeDetail, useEmployees } from "../api";
import type { RecordMode } from "../recordTypes";

export function TeamBlock({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const base = mode === "hr" ? "/hr/employees" : "/overview/people";
  const reports = useEmployees({ scope: "all", manager: employee.public_id });
  const people = reports.data?.results ?? [];
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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("team.changeManager")}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
