import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";

const ENTRIES = ["activity", "security", "hr-settings", "system"] as const;
const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

/** Overview, Oversight (UI 8.6): four entries, nothing to change anywhere. */
export default function OversightIndexPage() {
  const { t } = useTranslation("reports");
  return (
    <>
      <PageHeader title={t("oversight.title")}>{t("oversight.read_only")}</PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {ENTRIES.map((entry) => (
          <li key={entry}>
            <Link to={`/overview/oversight/${entry}`} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t(`oversight.entries.${entry}.title`)}</span>
              <span className="block text-body text-muted-foreground">{t(`oversight.entries.${entry}.description`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
