import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, row, tuesday } from "./requests";

test("HR validates, from its desk, a request the manager approved", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 3));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);

  // The desk says something waits, and leads to it.
  await become(page, MANAGER, HR);
  await page.goto("/hr");
  await expect(page.getByRole("heading", { level: 1, name: "Bureau RH", exact: true })).toBeVisible();
  const block = page.getByRole("region", { name: "À valider" });
  await expect(block.getByText(/En attente de validation : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : À valider", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/validate$/);

  const line = row(page, EMPLOYEE.name, day);
  await expect(line).toContainText("Télétravail");
  await expect(line).toContainText("Aucun document requis");
  await line.getByRole("button", { name: "Approuver", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await expect(sheet.getByText(/Votre validation est enregistrée\./)).toBeVisible();
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
  await expect(line).toHaveCount(0);

  // The employee finds the request approved.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await expect(row(page, "Télétravail", day)).toContainText("Approuvée");
});
