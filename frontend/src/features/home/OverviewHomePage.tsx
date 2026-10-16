import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Block, PageHeader, PageLoading } from "@/components";
import { useLang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays } from "@/lib/format";

import { useOverviewHome, type OverviewHome } from "./api";

type OutDepartment = OverviewHome["out_now"][number];
type OutName = OutDepartment["week"][number];

const QUIET = "text-body text-muted-foreground";

/** People out today, each counted once: a remote morning and an absent afternoon are one person. */
function outToday(groups: OutDepartment[]): number {
  return groups.reduce((total, group) => total + new Set(group.today.map((person) => person.name)).size, 0);
}

function OutDepartmentLines({ group }: { group: OutDepartment }) {
  const { t } = useTranslation("home");
  const lang = useLang();
  const id = useId();
  // A sick leave that waits for HR is listed as away and says so (master D52).
  const label = (person: OutName) =>
    t(`label.${person.label}`, { ns: "calendar" }) + (person.waiting ? t("lines.waiting") : "");
  const separator = t("overview.outNow.separator");
  const today = new Set(group.today.map((person) => `${person.name}|${person.start_date}`));
  const later = group.week.filter((person) => !today.has(`${person.name}|${person.start_date}`));

  return (
    <div role="group" aria-labelledby={id} className="py-3">
      <h3 id={id} className="text-body font-semibold text-foreground">{group.department}</h3>
      {group.today.length > 0 ? (
        <p className="text-body text-text-secondary">
          {t("overview.outNow.today", {
            people: group.today
              .map((person) => t("overview.outNow.person", { name: person.name, label: label(person) }))
              .join(separator),
          })}
        </p>
      ) : null}
      {later.length > 0 ? (
        <p className="text-body text-text-secondary">
          {t("overview.outNow.week", {
            people: later
              .map((person) =>
                t("overview.outNow.personOn", {
                  name: person.name,
                  label: label(person),
                  dates: formatDateRange(person.start_date, person.end_date, lang),
                }),
              )
              .join(separator),
          })}
        </p>
      ) : null}
    </div>
  );
}

/** /overview : how the company is doing on absence, and whether anything is stuck (UI 8.1). Read-only. */
export default function OverviewHomePage() {
  const { t } = useTranslation("home");
  const lang = useLang();
  const largestId = useId();
  const home = useOverviewHome();
  if (home.isPending) {
    return <PageLoading />;
  }
  if (home.error) {
    throw home.error;
  }
  const data = home.data;

  return (
    <div className="space-y-4">
      <PageHeader title={t("overview.title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title={t("overview.outNow.title")}>
          {data.out_now.length === 0 ? (
            <p className={QUIET}>{t("overview.outNow.empty")}</p>
          ) : (
            <>
              <p className="text-body font-semibold text-foreground">
                {t("overview.outNow.count", { count: outToday(data.out_now) })}
              </p>
              <div className="mt-1 divide-y divide-divider">
                {data.out_now.map((group) => <OutDepartmentLines key={group.department} group={group} />)}
              </div>
            </>
          )}
        </Block>

        <Block title={t("overview.absence.title")}>
          <table className="w-full text-left text-body">
            <thead>
              <tr className="text-caption text-muted-foreground">
                <th scope="col" className="py-2 font-medium">{t("overview.absence.department")}</th>
                <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">{t("overview.absence.thisMonth")}</th>
                <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">{t("overview.absence.previousMonth")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {data.absence_this_month.map((line) => (
                <tr key={line.department}>
                  <th scope="row" className="py-2 font-medium text-foreground">{line.department}</th>
                  <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{formatDays(line.days, lang)}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-text-secondary">{formatDays(line.previous_days, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title={t("overview.leaveOwed.title")}>
          <ul className="divide-y divide-divider">
            {data.leave_owed.departments.map((line) => (
              <li key={line.department} className="flex items-center justify-between py-2 text-body">
                <span className="font-medium text-foreground">{line.department}</span>
                <span className="shrink-0 whitespace-nowrap pl-3 font-semibold tabular-nums text-foreground">{formatDays(line.total, lang)}</span>
              </li>
            ))}
          </ul>
          <h3 id={largestId} className="mt-4 text-caption font-medium text-muted-foreground">{t("overview.leaveOwed.largest")}</h3>
          {data.leave_owed.largest.length === 0 ? (
            <p className={QUIET}>{t("overview.leaveOwed.empty")}</p>
          ) : (
            <ul aria-labelledby={largestId} className="divide-y divide-divider">
              {data.leave_owed.largest.map((person) => (
                <li key={`${person.name}-${person.department}`} className="flex items-center justify-between py-2 text-body">
                  <span className="text-foreground">{t("overview.leaveOwed.person", { name: person.name, department: person.department })}</span>
                  <span className="shrink-0 whitespace-nowrap pl-3 tabular-nums text-text-secondary">{formatDays(person.balance, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={t("overview.waiting.title")}>
          {data.waiting.length === 0 ? (
            <p className={QUIET}>{t("overview.waiting.empty")}</p>
          ) : (
            <ul className="divide-y divide-divider">
              {data.waiting.map((line) => (
                <li key={line.request_public_id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <Link to={`/requests/${line.request_public_id}`} className="text-body font-semibold text-foreground hover:underline">
                    {t("overview.waiting.what", { name: line.employee_name, type: line.type_name })}
                  </Link>
                  <span className="text-body text-text-secondary">
                    {[
                      line.waiting_on.length > 0 ? t("overview.waiting.on", { who: line.waiting_on.join(", ") }) : null,
                      line.since ? t("overview.waiting.since", { date: formatDateTime(line.since, lang) }) : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}
