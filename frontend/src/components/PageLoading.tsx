import { useTranslation } from "react-i18next";

export function PageLoading() {
  const { t } = useTranslation();
  return (
    <p aria-live="polite" aria-busy="true" className="py-6 text-body text-muted-foreground">
      {t("list.loading")}
    </p>
  );
}
