import { useTranslation } from "react-i18next";

/** On the test stack only: a visible sign that this is not production. */
export function EnvironmentStrip({ environment }: { environment?: string }) {
  const { t } = useTranslation();
  if (environment !== "test") return null;
  return (
    <p role="note" className="bg-[var(--env-test-bg)] px-4 py-1 text-center text-caption font-medium text-[var(--env-test)]">
      {t("testEnvironment")}
    </p>
  );
}
