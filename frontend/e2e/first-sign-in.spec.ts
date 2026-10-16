import { expect, test } from "@playwright/test";
import { createAdministrator, PASSWORD, signIn, signOut, SYSADMIN, uniqueEmail } from "./helpers";

const OWN_PASSWORD = "Nouveau-Cheval-2026!";

test("a first sign-in with a temporary password obliges to choose a new one", async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo, "leila");
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  const temporary = await createAdministrator(page, "Leila Essai", email);
  await signOut(page, SYSADMIN.name, "fr");

  await signIn(page, email, temporary, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/password\/new$/);

  // Nothing else is reachable until it is done.
  await page.goto("/admin/accounts");
  await expect(page).toHaveURL(/\/password\/new$/);

  // After the reload the temporary password is no longer in memory, so the page asks for it.
  await page.getByLabel("Mot de passe temporaire", { exact: true }).fill(temporary);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
  await page.getByLabel("Confirmez le nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
  await page.getByRole("button", { name: "Enregistrer le mot de passe", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page.getByText("Votre mot de passe a été modifié.")).toBeVisible();
  await signOut(page, "Leila Essai", "fr");

  // The temporary password no longer works; the chosen one does.
  await signIn(page, email, temporary, "fr");
  await expect(page.getByRole("alert")).toBeVisible();
  await signIn(page, email, OWN_PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
});
