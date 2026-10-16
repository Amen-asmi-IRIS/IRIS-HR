import { type Page, expect, test } from "@playwright/test";

import { createAdministrator, PASSWORD, signIn, signOut, SYSADMIN, uniqueEmail } from "./helpers";
import { expectNoAxeViolations, expectNoRawKeys, expectOneLanguage } from "./support/checks";
import { type Fixtures, ensureFixtures } from "./support/data";
import { HUBS, PAGES, resolve } from "./support/pages";
import { type Language, baseUrlOf, enterAs, open } from "./support/session";

const LANGUAGES: Language[] = ["fr", "en"];
const SIGN_IN = { fr: "Français", en: "English" } as const;
let fixtures: Fixtures;

// eslint-disable-next-line no-empty-pattern -- Playwright passes the fixtures first; none is needed
test.beforeAll(async ({}, testInfo) => {
  fixtures = await ensureFixtures(baseUrlOf(testInfo));
});

async function audit(page: Page, language: Language): Promise<void> {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page).toHaveTitle(/\S/);
  await expectOneLanguage(page, language);
  await expectNoRawKeys(page);
  await expectNoAxeViolations(page);
}

for (const language of LANGUAGES) {
  test.describe(`accessibility (${language})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "the phone project is covered by phone-fit.spec.ts");

    test("sign in", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: SIGN_IN[language], exact: true }).click();
      await expect(page.locator("main")).toBeVisible();
      await audit(page, language);
    });

    for (const spec of PAGES) {
      test(spec.id, async ({ page }) => {
        await enterAs(page, spec.persona, language);
        await open(page, resolve(spec, fixtures));
        await audit(page, language);
      });
    }

    for (const hub of HUBS) {
      test(`pages reached from ${hub.id}`, async ({ page }) => {
        await enterAs(page, hub.persona, language);
        await open(page, hub.path);
        await audit(page, language);
        const links = await page.locator(`main a[href^="/overview/oversight/"]`).evaluateAll((anchors) =>
          [...new Set(anchors.map((anchor) => anchor.getAttribute("href")!))]);
        expect(links.length, `${hub.path} links to no page`).toBeGreaterThan(0);
        for (const link of links) {
          await test.step(link, async () => {
            await open(page, link);
            await audit(page, language);
          });
        }
      });
    }

    test("an open task sheet", async ({ page }) => {
      await enterAs(page, "manager", language);
      await open(page, "/team/delegations");
      const trigger = page.locator("main").getByRole("button").first();      // the page's primary action
      await trigger.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();                                   // the focus returns to what opened the sheet
    });
  });
}

test.describe("accessibility of the first sign-in", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "desktop only");

  test("choose a new password", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, "audit");
    await signIn(page, SYSADMIN.email, PASSWORD, "fr");
    const temporary = await createAdministrator(page, "Audit Essai", email);
    await signOut(page, SYSADMIN.name, "fr");

    await signIn(page, email, temporary, "fr");
    await expect(page).toHaveURL(/\/password\/new$/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectOneLanguage(page, "fr");
    await expectNoRawKeys(page);
    await expectNoAxeViolations(page);
  });
});
