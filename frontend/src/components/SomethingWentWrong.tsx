import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

/** An unexpected error: a short message, the reference to quote, a way back. */
export function SomethingWentWrong({ requestId }: { requestId?: string }) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("errors:wentWrong.title")} · ${t("appName")}`;
  }, [t]);

  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:wentWrong.title")}</h1>
      <p className="text-body text-text-secondary">{t("errors:wentWrong.body")}</p>
      {requestId && <p className="tabular text-body font-medium text-foreground">{t("errors:wentWrong.reference", { id: requestId })}</p>}
      <Button asChild variant="primary" className="mt-2">
        <Link to="/">{t("errors:wentWrong.back")}</Link>
      </Button>
    </div>
  );
}
