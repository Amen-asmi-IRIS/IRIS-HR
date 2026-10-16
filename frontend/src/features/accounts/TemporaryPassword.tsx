import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

interface TemporaryPasswordProps {
  title: string;
  password: string;
  expiresAt: string;
  onDone: () => void;
}

/**
 * The temporary password, shown once (ACC-05). It lives in the state of the page that renders this
 * and nowhere else: not in storage, not in the address, not in a cache.
 */
export function TemporaryPassword({ title, password, expiresAt, onDone }: TemporaryPasswordProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex max-w-md flex-col gap-3">
      <h2 id={id} className="text-section font-semibold text-foreground">
        {title}
      </h2>
      <p className="tabular select-all rounded-md border border-border bg-muted px-4 py-3 text-dialog font-semibold tracking-wide text-foreground">{password}</p>
      <p className="text-body text-foreground">{t("accounts:temporary.intro")}</p>
      <p className="text-body text-text-secondary">{t("accounts:temporary.expires", { when: formatDateTime(expiresAt, lang) })}</p>
      <div className="mt-2">
        <Button variant="primary" onClick={onDone}>
          {t("accounts:temporary.done")}
        </Button>
      </div>
    </section>
  );
}
