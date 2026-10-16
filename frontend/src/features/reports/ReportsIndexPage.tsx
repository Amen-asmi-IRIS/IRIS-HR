import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { reportsFor, type ReportWorkspace } from "./definitions";

const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

interface ReportsIndexPageProps {
  workspace: ReportWorkspace;
}

/** The reports a workspace has. On the HR desk: the KPMG export first, and the activity log (UI 7.11). */
export default function ReportsIndexPage({ workspace }: ReportsIndexPageProps) {
  const { t } = useTranslation("reports");
  const isHr = workspace === "hr";

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          isHr ? (
            <Button asChild variant="primary">
              <Link to="/hr/reports/kpmg">{t("kpmg.title")}</Link>
            </Button>
          ) : undefined
        }
      >
        {workspace === "team" ? t("team_note") : undefined}
      </PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {reportsFor(workspace).map((report) => (
          <li key={report.name}>
            <Link to={`/${workspace}/reports/${report.name}`} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t(`names.${report.name}`)}</span>
              <span className="block text-body text-muted-foreground">{t(`descriptions.${report.name}`)}</span>
            </Link>
          </li>
        ))}
        {isHr && (
          <li>
            <Link to="/hr/reports/activity" className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t("activity.title")}</span>
              <span className="block text-body text-muted-foreground">{t("activity.description")}</span>
            </Link>
          </li>
        )}
      </ul>
    </>
  );
}
