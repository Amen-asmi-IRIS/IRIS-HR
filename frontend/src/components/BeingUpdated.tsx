import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const CHECK_EVERY_MS = 15_000;

interface BeingUpdatedProps {
  onRetry: () => void;
  /** Inside the shell it replaces the page only: the frame stays, and the page area is already the main landmark. */
  inShell?: boolean;
}

/** Shown while the application is restarting. It asks again by itself. */
export function BeingUpdated({ onRetry, inShell = false }: BeingUpdatedProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("errors:beingUpdated.title")} · ${t("appName")}`;
    const timer = setInterval(onRetry, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [onRetry, t]);

  const message = (
    <>
      <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:beingUpdated.title")}</h1>
      <p className="text-body text-text-secondary">{t("errors:beingUpdated.body")}</p>
      <Button variant="primary" className="mt-2" onClick={onRetry}>
        {t("actions.retry")}
      </Button>
    </>
  );

  if (inShell) return <div className="flex max-w-md flex-col items-start gap-3 py-12">{message}</div>;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">{message}</div>
    </main>
  );
}
