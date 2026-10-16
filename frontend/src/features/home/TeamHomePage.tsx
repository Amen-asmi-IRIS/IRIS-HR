import { useTranslation } from "react-i18next";

import { awayWithData } from "@/api/problem";
import { Block } from "@/components";
import ToDecidePage from "@/features/requests/queues/ToDecidePage";
import { useLang } from "@/i18n";
import { formatDateRange } from "@/lib/format";

import { useTeamHome, type TeamHome } from "./api";

type OutPerson = TeamHome["who_is_out"][number];

function WhoIsOut({ people }: { people: OutPerson[] }) {
  const { t } = useTranslation("home");
  const lang = useLang();

  function halfDay(person: OutPerson): string {
    if (person.start_date !== person.end_date) {
      return "";
    }
    if (person.starts_at_midday) {
      return ` (${t("part.afternoon", { ns: "calendar" })})`;
    }
    if (person.ends_at_midday) {
      return ` (${t("part.morning", { ns: "calendar" })})`;
    }
    return "";
  }

  return (
    <ul className="divide-y divide-divider">
      {people.map((person) => (
        <li key={`${person.employee.public_id}-${person.start_date}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <span className="text-body font-semibold text-foreground">{person.employee.name}</span>
          <span className="text-body text-text-secondary">
            {t("lines.what", { type: person.type_name, dates: formatDateRange(person.start_date, person.end_date, lang) })}
            {halfDay(person)}
            {person.waiting ? t("lines.waiting") : null}
            {person.today ? (
              <span className="ml-2 rounded-sm bg-waiting-bg px-1.5 py-0.5 text-caption font-medium text-waiting">
                {t("team.whoIsOut.today")}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** /team : plan 03b's queue page, then who is out (UI 6.1). */
export default function TeamHomePage() {
  const { t } = useTranslation("home");
  const home = useTeamHome();
  // The queue above holds the decision sheet: a re-reading that fails while the application is away
  // must not take it away with what was typed in it (master 13.1).
  if (home.error && !awayWithData(home)) {
    throw home.error;
  }
  const data = home.data;

  return (
    <div className="space-y-4">
      <ToDecidePage />
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Block title={t("team.whoIsOut.title")}>
            {data.who_is_out.length > 0
              ? <WhoIsOut people={data.who_is_out} />
              : <p className="text-body text-muted-foreground">{t("team.whoIsOut.empty")}</p>}
          </Block>
        </div>
      ) : null}
    </div>
  );
}
