import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut } from "./helpers";
import { EMPLOYEE, HR, landed, stamp } from "./people";

test("an employee corrects an address and HR accepts it", async ({ page }, testInfo) => {
  const address = `12 rue de Carthage, Tunis (${stamp(testInfo)})`;

  await signIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/me/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Mon profil", exact: true })).toBeVisible();

  // A run that stopped half-way leaves a proposal waiting: withdraw it first.
  const propose = page.getByRole("link", { name: "Proposer une modification", exact: true });
  const withdraw = page.getByRole("button", { name: "Retirer la proposition", exact: true });
  await expect(propose.or(withdraw)).toBeVisible();
  if (await withdraw.isVisible()) {
    await withdraw.click();
  }

  await propose.click();
  await expect(page.getByText("La modification s'applique une fois acceptée par les RH.")).toBeVisible();
  await page.getByLabel("Adresse", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Envoyer aux RH", exact: true }).click();

  // Back on the profile: the proposal waits, and the action that would add a second one is gone.
  await expect(page).toHaveURL(/\/me\/profile$/);
  await expect(page.getByRole("heading", { name: "Votre modification attend la décision des RH" })).toBeVisible();
  await expect(page.getByText(address)).toBeVisible();
  await expect(propose).toHaveCount(0);
  await signOut(page, EMPLOYEE.name, "fr");

  // HR decides. Until plan 03b builds the desk, the notification is what leads to this page.
  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/hr/profile-changes");
  await page.getByRole("button", { name: `Ouvrir la proposition de ${EMPLOYEE.name}`, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(address);
  await sheet.getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(page.getByText("Modification acceptée. La fiche est à jour.")).toBeVisible();
  await expect(page.getByText("Aucune modification à traiter.")).toBeVisible();

  // The record carries the new address.
  await page.goto("/hr/employees");
  await page.getByRole("link", { name: EMPLOYEE.name, exact: true }).click();
  await page.getByRole("button", { name: "Informations personnelles", exact: true }).click();
  await expect(page.getByText(address)).toBeVisible();
  await signOut(page, HR.name, "fr");

  // And the employee sees the answer.
  await signIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/me/profile");
  await expect(page.getByText(address)).toBeVisible();
  await expect(propose).toBeVisible();
  await page.getByRole("button", { name: "Mes propositions passées", exact: true }).click();
  await expect(page.getByText("Acceptée").first()).toBeVisible();
});
