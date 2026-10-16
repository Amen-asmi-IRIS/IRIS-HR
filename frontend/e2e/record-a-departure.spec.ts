import { expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";
import { createEmployee, fullName, HR, landed, newPerson } from "./people";

test("HR records a departure after reading its consequences", async ({ page }, testInfo) => {
  // Someone entered for this test: a departure cannot be undone, and the demo people serve other journeys.
  const person = newPerson(testInfo, "Sami");
  const name = fullName(person);

  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await createEmployee(page, person);

  await page.getByRole("button", { name: "Enregistrer un départ", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(`Enregistrer le départ de ${name}`);
  await expect(
    sheet.getByText("Plus aucun crédit mensuel de congés ne sera ajouté après la date de départ."),
  ).toBeVisible();
  await expect(sheet.getByText("La fiche est conservée et reste consultable par les RH.")).toBeVisible();

  // Nothing happens without a date and a reason.
  await sheet.getByRole("button", { name: "Enregistrer le départ", exact: true }).click();
  await expect(sheet.getByText("Ce champ est obligatoire.")).toHaveCount(2);

  await sheet.getByLabel("Date de départ", { exact: true }).fill("2026-10-31");
  await sheet.getByLabel("Motif", { exact: true }).fill("Démission");
  await sheet.getByRole("button", { name: "Enregistrer le départ", exact: true }).click();
  await expect(page.getByText("Départ enregistré.")).toBeVisible();
  await expect(page.getByText("A quitté l'entreprise")).toBeVisible();
  await expect(page.getByText("Motif : Démission")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer un départ", exact: true })).toHaveCount(0);

  // The person has left the normal list and is found again on request.
  await page.goto("/hr/employees");
  await page.getByRole("searchbox", { name: "Rechercher" }).fill(person.lastName);
  await expect(page.getByText("Aucun employé ne correspond")).toBeVisible();
  await page.getByRole("combobox", { name: "Statut" }).selectOption("archived");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
