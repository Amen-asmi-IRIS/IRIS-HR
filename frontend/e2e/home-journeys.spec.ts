import { expect, test } from "@playwright/test";

import { EMPLOYEE, MANAGER } from "./people";
import { PDF, become, ownWeek, pastWeek, tuesday } from "./requests";
import { apiOf } from "./support/session";

/** What these journeys read of `home/me`. */
interface HomeMe {
  needs_you: { kind: string; request: { public_id: string; start_date: string } }[];
}

test("journey 1 from the home: Home, New request, Send", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 15));
  await become(page, null, EMPLOYEE);
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "Solde" })).toBeVisible();

  await page.getByRole("link", { name: "Nouvelle demande" }).first().click();          // Home -> New request
  // The home lists requests too ("Télétravail, 20 oct."): choose the type once the chooser is on screen.
  await expect(page.getByRole("heading", { level: 1, name: "Quel type de demande ?", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();            // -> Send
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // Back on the home, the request is in progress and says whom it waits for.
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "En cours" }).getByText(`En attente de ${MANAGER.name}`).first()).toBeVisible();
});

test("journey 4 from the home: sickness declared, then Home (Needs you), Add certificate", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 6));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Congé maladie/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // Later: the home says a certificate is due, and leads to the request.
  const home = await apiOf(page).get<HomeMe>("/home/me");
  const due = home.needs_you.find((item) => item.kind === "certificate_due" && item.request.start_date === day);
  expect(due, "the home does not list the certificate as due").toBeTruthy();

  await page.goto("/me");
  const needs = page.getByRole("region", { name: "À faire" });
  await expect(needs).toBeVisible();
  await needs.locator(`a[href$="${due!.request.public_id}"]`).first().click();           // Home ("Needs you") -> the request
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await summary.getByRole("button", { name: "Ajouter le certificat", exact: true }).click();   // -> Add certificate
  const sheet = page.getByRole("dialog", { name: "Ajouter le certificat" });
  await sheet.getByLabel("Certificat médical", { exact: true }).setInputFiles({
    name: "certificat.pdf", mimeType: "application/pdf", buffer: PDF });
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(sheet).toHaveCount(0);

  // Nothing is asked of the employee for this request any more.
  await expect.poll(async () => {
    const after = await apiOf(page).get<HomeMe>("/home/me");
    return after.needs_you.some((item) => item.request.public_id === due!.request.public_id);
  }).toBe(false);
  await page.goto("/me");
  await expect(page.locator(`main a[href$="${due!.request.public_id}"]`).filter({ hasText: "Ajouter le certificat" })).toHaveCount(0);
});
