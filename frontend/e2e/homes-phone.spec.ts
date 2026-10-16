import { expect, test, type Page } from "@playwright/test";

import { enter } from "./calendar-homes";

test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "phone project only");

async function expectNoSidewaysScroll(page: Page) {
  const fits = await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  expect(fits).toBe(true);
}

test("the My space home fits a phone: the balance first, New request within reach", async ({ page }) => {
  await enter(page, "employee.a1");
  await page.goto("/me");

  const balance = page.getByRole("region", { name: "Solde" });
  await expect(balance).toBeVisible();
  await expect(balance.getByText(/^\d+(,\d+)? jours?$/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Nouvelle demande" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "En cours" })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the My team home shows who is out on a phone", async ({ page }) => {
  await enter(page, "manager.a");
  await page.goto("/team");

  const out = page.getByRole("region", { name: "Absents et télétravail" });
  await expect(out.getByRole("listitem").first().or(out.getByText("Toute l'équipe est présente ces sept prochains jours."))).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the calendar is an agenda on a phone", async ({ page }) => {
  await enter(page, "employee.a1");
  await page.goto("/me/calendar");

  await expect(page.getByRole("button", { name: "Période suivante" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expectNoSidewaysScroll(page);
});
