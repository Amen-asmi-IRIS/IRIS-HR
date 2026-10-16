import { useTranslation } from "react-i18next";

import { BalanceBlock } from "@/features/balances/BalanceBlock";
import { BalanceFact } from "@/features/balances/BalanceFact";
import { ProposalsBlock } from "@/features/profile/ProposalsBlock";
import { EmployeeRequestsBlock } from "@/features/requests/EmployeeRequestsBlock";
import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, isFullRecord } from "./api";
import { DocumentsBlock } from "./blocks/DocumentsBlock";
import { HistoryBlock } from "./blocks/HistoryBlock";
import { PersonalBlock } from "./blocks/PersonalBlock";
import { TeamBlock } from "./blocks/TeamBlock";
import type { RecordBlock, RecordFact } from "./recordTypes";
import { EmployeeStatusBadge } from "./ui";

export type { RecordBlock, RecordFact, RecordMode } from "./recordTypes";

function ManagerFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  return isFullRecord(employee) ? <>{employee.manager?.name ?? t("facts.noManager")}</> : null;
}

function ContractFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee)) {
    return null;
  }
  const type = t(`contract.${employee.contract_type}`);
  const start = formatDate(employee.contract_start_date ?? employee.hire_date, lang);
  if (employee.contract_end_date) {
    return <>{t("facts.contractUntil", { type, start, end: formatDate(employee.contract_end_date, lang) })}</>;
  }
  return <>{t("facts.contractSince", { type, date: start })}</>;
}

function AccountFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  return isFullRecord(employee) ? <>{t(employee.has_account ? "account.exists" : "account.missing")}</> : null;
}

function DepartureFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee) || !employee.archived_at) {
    return null;
  }
  return (
    <>
      {t("facts.departureValue", {
        date: formatDate(employee.archived_at, lang),
        reason: employee.archive_reason,
      })}
    </>
  );
}

const full = (employee: EmployeeDetail) => (isFullRecord(employee) ? employee : null);

export const RECORD_FACTS: RecordFact[] = [
  {
    id: "number",
    labelKey: "employees:facts.number",
    order: 10,
    modes: ["hr", "overview"],
    render: (employee) => full(employee)?.employee_number ?? null,
  },
  {
    id: "department",
    labelKey: "employees:facts.department",
    order: 20,
    modes: ["hr", "overview", "team"],
    render: (employee) => employee.department.name,
  },
  {
    id: "position",
    labelKey: "employees:facts.position",
    order: 30,
    modes: ["hr", "overview", "team"],
    render: (employee) => employee.position.title,
  },
  {
    id: "manager",
    labelKey: "employees:facts.manager",
    order: 40,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <ManagerFact employee={employee} /> : null),
  },
  {
    id: "contract",
    labelKey: "employees:facts.contract",
    order: 50,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <ContractFact employee={employee} /> : null),
  },
  {
    id: "status",
    labelKey: "employees:facts.status",
    order: 60,
    modes: ["hr", "overview"],
    render: (employee) => {
      const record = full(employee);
      return record ? <EmployeeStatusBadge status={record.status} /> : null;
    },
  },
  {
    id: "account",
    labelKey: "employees:facts.account",
    order: 70,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <AccountFact employee={employee} /> : null),
  },
  {
    id: "departure",
    labelKey: "employees:facts.departure",
    order: 75,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee)?.archived_at ? <DepartureFact employee={employee} /> : null),
  },
  {
    id: "email",
    labelKey: "employees:facts.email",
    order: 80,
    modes: ["team"],
    render: (employee) => employee.professional_email,
  },
  {
    id: "phone",
    labelKey: "employees:facts.phone",
    order: 90,
    modes: ["team"],
    render: (employee) => employee.phone || null,
  },
];

export const RECORD_BLOCKS: RecordBlock[] = [
  {
    id: "personal",
    titleKey: "employees:blocks.personal",
    order: 10,
    modes: ["hr", "overview"],
    render: (employee) => <PersonalBlock employee={employee} />,
  },
  {
    id: "team",
    titleKey: "employees:blocks.team",
    order: 20,
    modes: ["hr", "overview"],
    render: (employee, mode) => <TeamBlock employee={employee} mode={mode} />,
  },
  {
    id: "documents",
    titleKey: "employees:blocks.documents",
    order: 30,
    modes: ["hr", "overview"],
    render: (employee, mode) => <DocumentsBlock employee={employee} mode={mode} />,
  },
  {
    id: "history",
    titleKey: "employees:blocks.history",
    order: 90,
    modes: ["hr", "overview"],
    render: (employee) => <HistoryBlock employee={employee} />,
  },
];

RECORD_BLOCKS.push({
  id: "proposals",
  titleKey: "profile:record.title",
  order: 60,
  modes: ["hr"],
  render: (employee) => <ProposalsBlock employee={employee} />,
});

RECORD_BLOCKS.push({
  id: "requests",
  titleKey: "requests:recordBlock.title",
  order: 40,
  modes: ["hr", "team", "overview"],
  render: (employee, mode) => <EmployeeRequestsBlock employeeId={employee.public_id} mode={mode} />,
});

RECORD_BLOCKS.push({
  id: "balance",
  titleKey: "balances:block.title",
  order: 50,
  modes: ["hr", "team", "overview"],
  render: (employee, mode) => <BalanceBlock employeeId={employee.public_id} mode={mode} />,
});

RECORD_FACTS.push({
  id: "balance",
  labelKey: "balances:fact.label",
  order: 65,
  modes: ["hr", "team", "overview"],
  render: (employee) => <BalanceFact employeeId={employee.public_id} />,
});
