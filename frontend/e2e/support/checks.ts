import AxeBuilder from "@axe-core/playwright";
import { type Locator, type Page, expect } from "@playwright/test";

import type { Language } from "./session";

/** WCAG 2.1 A and AA rules of axe-core. A violation prints the rule, its help text and the nodes. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

// Interface words that exist in one language only. A French page that shows an English one mixes languages (U9).
const ENGLISH_ONLY = /\b(Save|Cancel|Search|Loading|Delete|Edit|Settings|Sign out|Requests|Employees|Approve|Refuse|Withdraw|Send back|Waiting for|Not available|Nothing to)\b/;
const FRENCH_ONLY = /\b(Enregistrer|Annuler|Rechercher|Chargement|Supprimer|Modifier|Paramètres|Se déconnecter|Demandes|Employés|Approuver|Refuser|Retirer|Renvoyer|En attente|Indisponible|Rien à)\b/;

export async function expectOneLanguage(page: Page, language: Language): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  const text = await page.locator("body").innerText();
  const foreign = (language === "fr" ? ENGLISH_ONLY : FRENCH_ONLY).exec(text);
  expect(foreign?.[0] ?? null, `a page in "${language}" shows "${foreign?.[0]}"`).toBeNull();
}

/** A translation key shown instead of its text looks like `requests:form.title` or `requests.form.title`. */
export async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  const keys = text.match(/\b(common|nav|auth|shell|notifications|accounts|settings|audit|employees|profile|delegations|requests|balances|calendar|home|reports|errors)[:.][A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+\b/g);
  expect(keys ?? [], `untranslated keys on ${page.url()}`).toEqual([]);
}

/** Moves the focus to `target` with the Tab key alone and checks that the focus can be seen. */
export async function tabTo(page: Page, target: Locator, maxPresses = 150): Promise<void> {
  await expect(target).toBeVisible();
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === element.ownerDocument.activeElement)) {
      const ring = await target.evaluate((element) => {
        const style = element.ownerDocument.defaultView!.getComputedStyle(element);
        return style.boxShadow !== "none" || (style.outlineStyle !== "none" && style.outlineWidth !== "0px");
      });
      expect(ring, "the focused element shows no focus indicator").toBe(true);
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`the Tab key did not reach ${target} in ${maxPresses} presses`);
}
