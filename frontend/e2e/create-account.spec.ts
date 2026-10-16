import { expect, test } from "@playwright/test";
import { createAdministrator, PASSWORD, signIn, SYSADMIN, uniqueEmail } from "./helpers";

test("the administrator creates an account and hands over a temporary password", async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo, "karim");
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();

  const temporary = await createAdministrator(page, "Karim Essai", email);
  expect(temporary.length).toBeGreaterThanOrEqual(12);

  // Back on the list: the account waits for its first sign-in, and the password is nowhere to be found.
  await expect(page).toHaveURL(/\/admin\/accounts/);
  await page.getByRole("searchbox", { name: "Nom ou adresse e-mail" }).fill(email);
  // The account is a table row on a desktop and a card on a phone. Its own line is read, by its address: while
  // the list is being read again or filtered it can show other accounts that wait for their first sign-in.
  const account = page.locator("main").locator("tbody tr, li").filter({ hasText: email });
  await expect(account.getByText("En attente de première connexion")).toBeVisible();
  await expect(page.getByText(temporary)).toHaveCount(0);
  await page.goBack();
  await expect(page.getByText(temporary)).toHaveCount(0);

  // The same address a second time is refused next to the field, and what was typed stays.
  await page.goto("/admin/accounts/new");
  await page.getByLabel("Nom", { exact: true }).fill("Karim Essai");
  await page.getByLabel("Adresse e-mail professionnelle", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await expect(page.getByLabel("Adresse e-mail professionnelle", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Karim Essai");
});
