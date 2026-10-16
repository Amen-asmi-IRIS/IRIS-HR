import { useTranslation } from "react-i18next";

import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, isFullRecord } from "../api";

export function PersonalBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee)) {
    return null;
  }
  const blank = t("personal.none");
  const rows: [string, string][] = [
    [
      t("fields.date_of_birth"),
      employee.date_of_birth ? formatDate(employee.date_of_birth, lang) : blank,
    ],
    [t("fields.gender"), employee.gender ? t(`gender.${employee.gender}`) : blank],
    [t("fields.professional_email"), employee.professional_email],
    [t("fields.personal_email"), employee.personal_email || blank],
    [t("fields.phone"), employee.phone || blank],
    [t("fields.address"), employee.address || blank],
    [t("fields.emergency_contact_name"), employee.emergency_contact_name || blank],
    [t("fields.emergency_contact_phone"), employee.emergency_contact_phone || blank],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption text-muted-foreground">{label}</dt>
          <dd className="text-body">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
