import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { active: "approved", suspended: "waiting", archived: "neutral" } as const;

/** Where an employee stands, as a sentence with a coloured dot. */
export function EmployeeStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("employees");
  const tone = TONES[status as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`status.${status}`)}</StatusBadge>;
}
