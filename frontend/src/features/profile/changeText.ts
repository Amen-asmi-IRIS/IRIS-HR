import { useTranslation } from "react-i18next";

import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

/** How a proposed field and its values read to a person: translated label, translated codes, dates, "(empty)". */
export function useChangeText() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  return {
    label: (field: string): string => t(`employees:fields.${field}`, { defaultValue: field }),
    value: (field: string, raw: string | null | undefined): string => {
      if (raw === null || raw === undefined || raw === "") {
        return t("blank");
      }
      if (field === "gender") {
        return t(`employees:gender.${raw}`, { defaultValue: raw });
      }
      if (field === "date_of_birth") {
        return formatDate(raw, lang);
      }
      return raw;
    },
  };
}
