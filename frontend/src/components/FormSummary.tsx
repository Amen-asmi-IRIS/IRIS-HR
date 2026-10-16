import { useTranslation } from "react-i18next";

/** Problems that belong to no input, shown above the form. */
export function FormSummary({ problems }: { problems: string[] }) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-[var(--refused-border)] bg-refused-bg px-4 py-3 text-body text-refused">
      {problems.length === 1 ? (
        <p>{problems[0]}</p>
      ) : (
        <>
          <p className="font-semibold">{t("form.summaryTitle")}</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
