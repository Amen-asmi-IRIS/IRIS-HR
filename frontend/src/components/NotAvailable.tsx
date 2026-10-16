import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";

/** The page or item does not exist or is outside the user's reach. It never says which. */
export function NotAvailable() {
  const { t } = useTranslation();
  const me = useMe();

  useEffect(() => {
    document.title = `${t("errors:notAvailable.title")} · ${t("appName")}`;
  }, [t]);

  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:notAvailable.title")}</h1>
      <p className="text-body text-text-secondary">{t("errors:notAvailable.body")}</p>
      <Button asChild variant="primary" className="mt-2">
        <Link to={me.data ? "/" : "/login"}>{t("errors:notAvailable.back")}</Link>
      </Button>
    </div>
  );
}
