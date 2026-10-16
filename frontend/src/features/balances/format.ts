import type { Lang } from "@/i18n";

const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

/** "+2.5", "-5" ("+2,5" in French): the signed amount of a ledger line, without its unit. */
export function formatSigned(amount: string | number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], { signDisplay: "exceptZero", maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

/** A number of days as a person types it: "1,5" and "1.5" both mean one and a half. Null when it is not a number. */
export function parseDays(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}
