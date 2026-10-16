import { expect, test } from "@playwright/test";
import { createEmployee, fullName, HR, newPerson } from "./people";
import { become, ownWeek, row, tuesday } from "./requests";

test("HR records, for a request nobody can decide, the decision its manager gave on paper", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 8));

  // A manager who has no account cannot decide in the application: the request waits for them, and HR is alerted
  // at once (master D13). HR enters both people, then the request in the employee's name.
  await become(page, null, HR);
  const boss = newPerson(testInfo, "Rachid");
  await createEmployee(page, boss);
  const clerk = newPerson(testInfo, "Sami");
  await createEmployee(page, clerk, `${fullName(boss)} · Souscription`);
  await page.getByRole("button", { name: "Demandes", exact: true }).click();
  await page.getByRole("link", { name: "Nouvelle demande pour cet employé", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Nouvelle demande pour ${fullName(clerk)}`, exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  const computed = page.getByRole("complementary", { name: "Calculé pour vous" });
  await expect(computed.getByText("1 jour", { exact: true })).toBeVisible();
  await expect(computed.getByText(`Son responsable, ${fullName(boss)}, puis les RH`)).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // The desk says something is stuck, and leads to it.
  await page.goto("/hr");
  const block = page.getByRole("region", { name: "Bloquées chez un responsable" });
  await expect(block.getByText(/Sans décision : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : Bloquées chez un responsable", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/stuck$/);

  const line = row(page, fullName(clerk), day);
  await expect(line).toContainText(fullName(boss));
  await line.getByRole("button", { name: "Saisir la décision", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Saisir une décision donnée hors de l'application" });
  // Who decided defaults to the manager the step waits for.
  await expect(sheet.getByLabel("Qui a décidé", { exact: true }).locator("option:checked")).toHaveText(
    `${fullName(boss)} · Souscription`,
  );
  await sheet.getByLabel("Comment", { exact: true }).selectOption({ label: "Sur papier" });

  // The note is mandatory.
  const record = sheet.getByRole("button", { name: "Enregistrer la décision", exact: true });
  await record.click();
  await expect(
    sheet.getByText("La note est obligatoire : dites dans quelles circonstances la décision a été donnée."),
  ).toBeVisible();
  await sheet.getByLabel("Note", { exact: true }).fill("Accord signé sur le formulaire papier");
  await record.click();
  await expect(page.getByText("Décision enregistrée.")).toBeVisible();
  await expect(line).toHaveCount(0);

  // The request moved on to HR, and its steps say how the decision was given and who entered it.
  await page.goto("/hr/validate");
  await row(page, fullName(clerk), day).getByRole("button", { name: fullName(clerk), exact: true }).click();
  // The block "Étapes" one step away; the summary also states the earlier decision, as HR reads it before its own.
  const steps = page.locator("section").filter({ has: page.getByRole("button", { name: "Étapes", exact: true }) }).last();
  await steps.getByRole("button", { name: "Étapes", exact: true }).click();
  await expect(steps.getByText(`Décision saisie par ${HR.name}, donnée sur papier.`, { exact: false })).toBeVisible();
});
