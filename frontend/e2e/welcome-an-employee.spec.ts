import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";
import { createEmployee, fullName, HR, landed, newPerson } from "./people";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

test("HR welcomes a new employee and the administrator creates the account", async ({ page }, testInfo) => {
  const person = newPerson(testInfo, "Nour");
  const name = fullName(person);

  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await createEmployee(page, person);
  await expect(page.getByText("Pas encore de compte")).toBeVisible();

  // The contract goes on the record, shared with the employee, and comes back as a download.
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un document", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Fichier", { exact: true }).setInputFiles({
    name: "contrat.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await sheet.getByLabel("Intitulé", { exact: true }).fill("Contrat");
  await sheet.getByLabel("Partager avec l'employé", { exact: true }).click();
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Document ajouté.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger Contrat", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("contrat.pdf");

  // The session ends while the record is open: the next download leads to Sign in, and from there back to the record.
  const record = new URL(page.url()).pathname;
  await page.context().clearCookies();
  await page.getByRole("link", { name: "Télécharger Contrat", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Connexion", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(record);

  // The administrator is told who has no account, and creates it from the record alone.
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Créer un compte", exact: true }).click();
  await page.getByLabel("Employé", { exact: true }).selectOption({ label: name });
  await expect(page.getByLabel("Nom", { exact: true })).toHaveCount(0);
  await expect(page.getByText(person.email)).toBeVisible();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
  await expect(result).toBeVisible();
  const temporary = (await result.locator("p").first().innerText()).trim();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await signOut(page, SYSADMIN.name, "fr");

  // The account is the employee's: the address of the record and the temporary password open it.
  await signIn(page, person.email, temporary, "fr");
  await expect(
    page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true }),
  ).toBeVisible();
});
