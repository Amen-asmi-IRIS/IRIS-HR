import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { HR_SETTINGS_SUBJECTS } from "@/features/settings/hrSubjects";

/** The HR settings subjects that have a read-only page under Oversight (see `routes.tsx`). */
export const OVERSIGHT_HR_SUBJECTS = ["request-types", "steps", "events", "holidays", "parameters", "departments"];

const SYSTEM_ENTRIES = ["status", "accounts", "parameters"] as const;
const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

export type OversightHub = "hr-settings" | "system";

interface HubEntry {
  to: string;
  title: string;
  description?: string;
}

/** One of the two hubs of Oversight: the HR settings, or the accounts and the system. */
export default function OversightHubPage({ hub }: { hub: OversightHub }) {
  const { t } = useTranslation("reports");

  // The HR hub follows the HR desk's own settings index: same subjects, same order, same words.
  const entries: HubEntry[] =
    hub === "hr-settings"
      ? [...HR_SETTINGS_SUBJECTS]
          .filter((subject) => OVERSIGHT_HR_SUBJECTS.includes(subject.id))
          .sort((a, b) => a.order - b.order)
          .map((subject) => ({
            to: `/overview/oversight/hr-settings/${subject.id}`,
            title: t(subject.titleKey),
            description: t(subject.descriptionKey),
          }))
      : SYSTEM_ENTRIES.map((entry) => ({
          to: `/overview/oversight/system/${entry}`,
          title: t(`oversight.system.${entry}`),
        }));

  return (
    <>
      <PageHeader title={t(`oversight.entries.${hub}.title`)} back="/overview/oversight">
        {t("oversight.read_only")}
      </PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {entries.map((entry) => (
          <li key={entry.to}>
            <Link to={entry.to} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{entry.title}</span>
              {entry.description && <span className="block text-body text-muted-foreground">{entry.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
