import { useTranslation } from "react-i18next";

import { StatusBadge, type StatusTone } from "@/components";
import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useTeamHome, type TeamHome } from "./api";

type TeamPerson = TeamHome["people"][number];

const TONES: Record<TeamPerson["today"], StatusTone> = { in: "approved", absent: "neutral", remote: "info" };

/** One team member's line in the answer every cell of the People table shares. */
function usePerson(employeeId: string): TeamPerson | undefined {
  const home = useTeamHome();
  return home.data?.people.find((person) => person.public_id === employeeId);
}

/** UI 6.3 "today": in, absent or remote. Empty until the team is known. */
export function TodayCell({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("home");
  const person = usePerson(employeeId);
  if (!person) {
    return null;
  }
  // Away only through a sick leave that waits for HR: away, and said to be waiting (master D52).
  return (
    <StatusBadge tone={TONES[person.today]}>
      {t(`people.presence.${person.today}`)}
      {person.waiting ? t("lines.waiting") : null}
    </StatusBadge>
  );
}

/** UI 6.3 "annual balance": the posted balance today. */
export function BalanceCell({ employeeId }: { employeeId: string }) {
  const lang = useLang();
  const person = usePerson(employeeId);
  if (!person) {
    return null;
  }
  return <span className="tabular-nums">{formatDays(person.balance, lang)}</span>;
}
