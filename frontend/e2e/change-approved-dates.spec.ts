import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, frDate, ownWeek, row, tuesday, validateAsHr } from "./requests";

test("an employee changes the date of an approved request; the original stays until the change is approved", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 6));
  const newDay = tuesday(ownWeek(testInfo, 6) + 20);

  // An approved day of remote work.
  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);

  // Requests, the request, Change the dates.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await row(page, "Télétravail", day).getByRole("button", { name: "Télétravail", exact: true }).click();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await summary.getByRole("link", { name: "Changer les dates", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Modifier une demande approuvée", exact: true })).toBeVisible();
  await expect(page.getByText("L'original reste valable tant que la modification n'est pas approuvée.")).toBeVisible();
  await page.getByLabel("Fin", { exact: true }).fill(newDay);
  await page.getByLabel("Début", { exact: true }).fill(newDay);
  await expect(page.getByText("Nouveau décompte")).toBeVisible();
  await page.getByLabel("Motif", { exact: true }).fill("Réunion déplacée");
  await page.getByRole("button", { name: "Envoyer la modification", exact: true }).click();
  await expect(page.getByText("Modification envoyée.")).toBeVisible();

  // Nothing has changed yet: the request is approved for its first date, and the change waits.
  await expect(summary.getByText("Approuvée", { exact: true })).toBeVisible();
  await expect(summary.getByText(`Votre modification attend ${MANAGER.name}`)).toBeVisible();
  await expect(summary.getByText(frDate(day))).toBeVisible();

  // The change follows the same steps.
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await page.goto("/hr/validate");
  await expect(row(page, EMPLOYEE.name, day)).toContainText("Changement de dates");
  await validateAsHr(page, EMPLOYEE.name, day);

  // The request now carries the new date.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await expect(row(page, "Télétravail", newDay)).toContainText("Approuvée");
  await expect(row(page, "Télétravail", day)).toHaveCount(0);
});
