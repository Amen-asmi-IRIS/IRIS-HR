import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/checks";
import { type Fixtures, ensureFixtures } from "./support/data";
import { PAGES, resolve } from "./support/pages";
import { baseUrlOf, enterAs, open } from "./support/session";

let fixtures: Fixtures;

test.describe("phone", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "runs in the phone project only");

  // eslint-disable-next-line no-empty-pattern -- Playwright passes the fixtures first; none is needed
  test.beforeAll(async ({}, testInfo) => {
    fixtures = await ensureFixtures(baseUrlOf(testInfo));
  });

  for (const spec of PAGES) {
    test(`${spec.id} fits a phone`, async ({ page }) => {
      await enterAs(page, spec.persona);
      await open(page, resolve(spec, fixtures));

      const overflow = (await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")) as number;
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      const small = await page
        .locator("button:visible, [role=button]:visible, nav a:visible, select:visible, input:visible:not([type=checkbox]):not([type=radio]):not([type=hidden])")
        .evaluateAll((elements) => elements
          .map((element) => ({
            name: (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName).trim().slice(0, 40),
            box: element.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.width > 0 && (box.height < 44 || box.width < 44))
          .map(({ name, box }) => `${name} (${Math.round(box.width)}x${Math.round(box.height)})`));
      expect(small, "touch targets under 44px").toEqual([]);

      await expectNoAxeViolations(page);
    });
  }

  test("a focused task fills the screen", async ({ page }) => {
    await enterAs(page, "manager");
    await open(page, "/team/delegations");
    await page.getByRole("button", { name: "Nommer un délégué", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.round(box!.width)).toBe(viewport.width);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(viewport.height - 1);
  });

  test("navigation is a bottom bar with the entries of the workspace only", async ({ page }) => {
    await enterAs(page, "hr");
    await open(page, "/hr");
    const bar = page.getByRole("navigation").filter({ has: page.locator('a[href="/hr/employees"]') }).last();
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
    const hrefs = await bar.locator("a").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")!));
    expect(hrefs.every((href) => href === "/hr" || href.startsWith("/hr/"))).toBe(true);
    expect(new Set(hrefs).size).toBeLessThanOrEqual(6);
  });
});
