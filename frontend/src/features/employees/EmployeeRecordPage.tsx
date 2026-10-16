import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { awayWithData } from "@/api/problem";
import { backToList, Disclosure, PageHeader, PageLoading } from "@/components";

import { useEmployee } from "./api";
import { RECORD_BLOCKS, RECORD_FACTS, type RecordMode } from "./recordBlocks";
import { RecordActions } from "./RecordActions";

const LISTS: Record<RecordMode, string> = {
  hr: "/hr/employees",
  overview: "/overview/people",
  team: "/team/people",
};

export default function EmployeeRecordPage({ mode }: { mode: RecordMode }) {
  const { id } = useParams();
  const { t } = useTranslation("employees");
  const employee = useEmployee(id);

  if (employee.isPending) {
    return <PageLoading />;
  }
  // The shell's ProblemBoundary shows "not available" for a record that is missing or outside reach.
  // The page holds sheets with forms: while the application is only away it stays, with what was typed.
  if (!employee.data || (employee.error && !awayWithData(employee))) {
    throw employee.error;
  }
  const record = employee.data;
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  const facts = RECORD_FACTS.filter((fact) => fact.modes.includes(mode)).sort(byOrder);
  const blocks = RECORD_BLOCKS.filter((block) => block.modes.includes(mode)).sort(byOrder);

  return (
    <>
      <PageHeader
        title={record.name}
        back={backToList(LISTS[mode])}
        primary={mode === "hr" ? <RecordActions employee={record} mode={mode} /> : undefined}
      />
      <dl className="grid gap-x-8 gap-y-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => {
          const value = fact.render(record);
          return value === null ? null : (
            <div key={fact.id}>
              <dt className="text-caption text-muted-foreground">{t(fact.labelKey)}</dt>
              <dd className="text-body font-medium">{value}</dd>
            </div>
          );
        })}
      </dl>
      <div className="mt-6 grid gap-3">
        {blocks.map((block) => (
          <Disclosure key={block.id} title={t(block.titleKey)}>
            {block.render(record, mode)}
          </Disclosure>
        ))}
      </div>
    </>
  );
}
