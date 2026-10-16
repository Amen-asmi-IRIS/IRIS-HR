import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LANGUAGES, useLang } from "@/i18n";
import { useChangeLanguage } from "./useChangeLanguage";

export function LanguageSwitch() {
  const { t } = useTranslation();
  const lang = useLang();
  const changeLanguage = useChangeLanguage();
  return (
    <div role="group" aria-label={t("language.label")} className="flex gap-1">
      {LANGUAGES.map((code) => (
        <Button
          key={code}
          size="sm"
          lang={code}
          variant={code === lang ? "secondary" : "ghost"}
          aria-pressed={code === lang}
          onClick={() => {
            if (code !== lang) changeLanguage(code);
          }}
        >
          {t(`language.${code}`)}
        </Button>
      ))}
    </div>
  );
}
