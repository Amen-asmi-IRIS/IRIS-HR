import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, SYSADMIN } from "./helpers";

test("the administrator checks the system", async ({ page }, testInfo) => {
  // The reset just before the suite removed the worker's heartbeat; it returns within a minute.
  test.setTimeout(240_000);
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();

  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Tout fonctionne.")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 180_000 });
  await expect(page.getByText("Signal de vie du service de tâches")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);

  // The tab bar of a phone writes the short label of the entry.
  const securityLog = testInfo.project.name === "phone" ? "Sécurité" : "Journal de sécurité";
  await page.getByRole("link", { name: securityLog, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Journal de sécurité", exact: true })).toBeVisible();
  // The event is in a table cell on a desktop and in a card on a phone; the filter above also lists the word.
  await expect(page.locator("main").locator("td, dd").getByText("Connexion", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(page.getByText("Limite d'inactivité (minutes)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer les modifications" })).toHaveCount(0);
});
