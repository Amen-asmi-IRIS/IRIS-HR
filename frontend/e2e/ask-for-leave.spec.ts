import { expect, test } from "@playwright/test";
import { EMPLOYEE, MANAGER } from "./people";
import { become, ownWeek, row, tuesday } from "./requests";

test("an employee asks for a day of leave and sees who will decide", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 1));

  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests");
  await page.getByRole("link", { name: "Nouvelle demande", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quel type de demande ?", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Congé annuel/ }).click();

  // Two dates are asked; the count and the approvers are worked out and shown.
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  const computed = page.getByRole("complementary", { name: "Calculé pour vous" });
  await expect(computed.getByText("1 jour", { exact: true })).toBeVisible();
  await expect(computed.getByText(`Votre responsable, ${MANAGER.name}, puis les RH`)).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // The request says where it stands, what happens next, and what can still be done.
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  await expect(summary.getByText("Ensuite, les RH la valident.")).toBeVisible();
  await expect(summary.getByRole("link", { name: "Modifier", exact: true })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Retirer la demande", exact: true })).toBeVisible();

  await page.goto("/me/requests");
  await expect(row(page, "Congé annuel", day)).toContainText(`En attente de ${MANAGER.name}`);
});
