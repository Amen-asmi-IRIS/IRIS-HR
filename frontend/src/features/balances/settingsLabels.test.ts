import { describe, expect, it } from "vitest";

import en from "@/i18n/locales/en/settings.json";
import fr from "@/i18n/locales/fr/settings.json";

type Labels = Record<string, { label?: string; hint?: string } | undefined>;

describe("HR parameters", () => {
  it.each(["monthly_credit_days", "credit_start_date"])("label the setting %s in both languages", (key) => {
    for (const texts of [fr as Labels, en as Labels]) {
      expect(texts[key]?.label).toBeTruthy();
      expect(texts[key]?.hint).toBeTruthy();
    }
  });
});
