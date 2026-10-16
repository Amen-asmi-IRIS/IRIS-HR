import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeader } from "@/components";

import { HR_SETTINGS_SUBJECTS } from "./hrSubjects";

export default function HrSettingsIndexPage() {
  const { t } = useTranslation("employees");
  const subjects = [...HR_SETTINGS_SUBJECTS].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader title={t("settingsIndex.title")} />
      <ul className="grid max-w-3xl gap-3">
        {subjects.map((subject) => (
          <li key={subject.id}>
            <Link
              to={subject.path}
              className="block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted"
            >
              <span className="block text-section font-semibold text-foreground">{t(subject.titleKey)}</span>
              <span className="block text-body text-muted-foreground">{t(subject.descriptionKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
