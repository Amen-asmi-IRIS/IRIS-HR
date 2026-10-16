import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";

/** A signed-in person whose roles open no workspace: nothing to show, and who to ask. */
export default function NoWorkspacePage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-md">
      <PageHeader title={t("shell:noWorkspace.title")} />
      <p className="text-body text-text-secondary">{t("shell:noWorkspace.body")}</p>
    </div>
  );
}
