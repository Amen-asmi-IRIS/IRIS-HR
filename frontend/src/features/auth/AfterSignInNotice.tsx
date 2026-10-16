import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useCurrentUser } from "./api";
import { clearSignInNotice, signInNoticePending } from "./session";

/** Once per sign-in: when the user last signed in and, if it happened, who reset their password (ACC-07). */
export function AfterSignInNotice() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const [visible, setVisible] = useState(() => signInNoticePending());

  useEffect(() => {
    clearSignInNotice();
  }, []);

  if (!visible) return null;
  return (
    <aside
      aria-label={t("auth:notice.label")}
      className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[var(--info-border)] bg-info-bg px-4 py-3 text-body text-info"
    >
      <div className="flex flex-col gap-1">
        <p>{me.previous_login_at ? t("auth:notice.previous", { when: formatDateTime(me.previous_login_at, lang) }) : t("auth:notice.first")}</p>
        {me.password_reset && (
          <p>
            {me.password_reset.by
              ? t("auth:notice.reset", { by: me.password_reset.by, when: formatDateTime(me.password_reset.at, lang) })
              : t("auth:notice.resetNoName", { when: formatDateTime(me.password_reset.at, lang) })}
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
        {t("actions.close")}
      </Button>
    </aside>
  );
}
