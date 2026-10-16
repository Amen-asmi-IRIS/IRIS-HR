import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { setApiLanguage } from "@/api/client";

export const LANGUAGES = ["fr", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];

const STORAGE_KEY = "iris.language";

export function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "en";
}

type Tree = { [key: string]: string | Tree };

// Every locales/<lang>/<namespace>.json is picked up; adding a feature never edits this file.
const files = import.meta.glob<Tree>("./locales/*/*.json", { eager: true, import: "default" });
const resources: Record<string, Record<string, Tree>> = {};
for (const [path, tree] of Object.entries(files)) {
  const match = /^\.\/locales\/([a-z]{2})\/([A-Za-z]+)\.json$/.exec(path);
  if (!match) continue;
  resources[match[1]] = { ...resources[match[1]], [match[2]]: tree };
}

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

function initialLanguage(): Lang {
  const saved = stored();
  if (isLang(saved)) return saved;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
}

function apply(lang: string): void {
  document.documentElement.lang = lang;
  setApiLanguage(lang);
}

// In tests a missing key is an error, so a typo cannot ship as a blank label.
const strict = import.meta.env.MODE === "test";

await i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: "fr",
  defaultNS: "common",
  ns: Object.keys(resources.fr ?? {}),
  interpolation: { escapeValue: false },
  saveMissing: strict,
  missingKeyHandler: strict
    ? (_languages, namespace, key) => {
        throw new Error(`Missing translation ${namespace}:${key}`);
      }
    : undefined,
});

apply(i18n.language);
i18n.on("languageChanged", (lang) => {
  apply(lang);
  remember(lang);
});

export async function setLanguage(lang: Lang): Promise<void> {
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/** The active language, re-rendering the caller when it changes. */
export function useLang(): Lang {
  const { i18n: instance } = useTranslation();
  return isLang(instance.language) ? instance.language : "fr";
}

export default i18n;
