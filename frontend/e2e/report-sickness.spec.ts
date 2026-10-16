import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { become, pastWeek, PDF, row, tuesday } from "./requests";

test("an employee reports a sick day, adds the certificate later, and the manager sees neither comment nor certificate", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 0));

  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Congé maladie/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByLabel("Commentaire (facultatif)", { exact: true }).fill("Forte fièvre");
  const computed = page.getByRole("complementary", { name: "Calculé pour vous" });
  await expect(computed.getByText("1 jour", { exact: true })).toBeVisible();
  await expect(computed.getByText("Votre commentaire et votre certificat ne sont vus que par les RH.")).toBeVisible();
  // The certificate can follow: the declaration is sent without it.
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText("En attente des RH")).toBeVisible();
  await expect(summary.getByText(/Certificat à fournir avant le/)).toBeVisible();

  // Later: the list says what is expected, and the request offers it first.
  await page.goto("/me/requests");
  const line = row(page, "Congé maladie", day);
  await expect(line).toContainText("Certificat à fournir avant le");
  await line.getByRole("button", { name: "Congé maladie", exact: true }).click();
  await summary.getByRole("button", { name: "Ajouter le certificat", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Ajouter le certificat" });
  await sheet.getByLabel("Certificat médical", { exact: true }).setInputFiles({
    name: "certificat.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Fichier ajouté.")).toBeVisible();
  await expect(summary.getByText(/Certificat à fournir/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mon commentaire et mes fichiers", exact: true }).click();
  await expect(page.getByRole("link", { name: "certificat.pdf", exact: true })).toBeVisible();
  await expect(page.getByText("Forte fièvre")).toBeVisible();

  // HR enters the validation it was given on paper, with the signed form, and can read the form back.
  await become(page, EMPLOYEE, HR);
  await page.goto("/hr/validate");
  await row(page, EMPLOYEE.name, day).getByRole("button", { name: EMPLOYEE.name, exact: true }).click();
  await page.getByRole("button", { name: "Autres actions RH", exact: true }).click();
  await page.getByRole("button", { name: "Saisir une décision donnée hors de l'application", exact: true }).click();
  const paper = page.getByRole("dialog", { name: "Saisir une décision donnée hors de l'application" });
  await paper.getByLabel("Qui a décidé", { exact: true }).selectOption({ label: `${HR.name} · Finance et administration` });
  await paper.getByLabel("Comment", { exact: true }).selectOption({ label: "Sur papier" });
  await paper.getByLabel("Note", { exact: true }).fill("Formulaire remis à l'accueil");
  await paper.getByLabel("Formulaire signé (scan) (facultatif)", { exact: true }).setInputFiles({
    name: "formulaire-signe.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await paper.getByRole("button", { name: "Enregistrer la décision", exact: true }).click();
  await expect(page.getByText("Décision enregistrée.")).toBeVisible();
  await expect(summary.getByText("Approuvée", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await summary.getByRole("link", { name: "formulaire-signe.pdf", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("formulaire-signe.pdf");

  // The manager is informed of the absence, and of nothing medical: no comment, no certificate, no signed form.
  await become(page, HR, MANAGER);
  await page.goto("/team/requests");
  await row(page, EMPLOYEE.name, day).getByRole("button", { name: EMPLOYEE.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Congé maladie", exact: true })).toBeVisible();
  await expect(
    page.getByText("Déclaration transmise pour information : vous n'avez aucune décision à prendre."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approuver", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Étapes", exact: true }).click();
  await page.getByRole("button", { name: "Historique complet", exact: true }).click();
  await expect(page.getByText("Forte fièvre")).toHaveCount(0);
  await expect(page.getByText(/certificat/i)).toHaveCount(0);
  await expect(page.getByText(/formulaire/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /fichiers/i })).toHaveCount(0);
});
