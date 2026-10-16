import { useTranslation } from "react-i18next";
import type { FieldProblem } from "@/api/problem";

// The query names that have a text under `reports:fields`.
const NAMED = new Set(["from", "to", "on", "year", "department", "employee", "type", "step"]);

/** What the server refused in a selection, directly under the filters, each problem named after its filter. */
export function ReportProblems({ problems }: { problems: FieldProblem[] }) {
  const { t } = useTranslation("reports");
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-4 flex flex-col gap-1 text-body text-refused">
      {problems.map((problem, index) => (
        <p key={`${problem.field ?? "general"}-${problem.code}-${index}`} className="m-0">
          {problem.field && NAMED.has(problem.field)
            ? t("problem", { field: t(`fields.${problem.field}`), message: problem.detail })
            : problem.detail}
        </p>
      ))}
    </div>
  );
}
