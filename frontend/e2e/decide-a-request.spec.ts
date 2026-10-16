import { expect, test } from "@playwright/test";
import { EMPLOYEE, MANAGER } from "./people";
import { askFor, become, ownWeek, row, toDecide, tuesday } from "./requests";

test("a manager approves a request from the To decide list, without opening it", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 2));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);

  // My team opens on what waits for the manager.
  await become(page, EMPLOYEE, MANAGER);
  await page.goto("/team");
  await expect(page.getByRole("heading", { level: 1, name: "À décider", exact: true })).toBeVisible();
  const item = toDecide(page, EMPLOYEE.name, day);
  await expect(item).toContainText("Télétravail");
  await expect(item).toContainText("1 jour");
  await item.getByRole("button", { name: "Approuver", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await expect(sheet.getByText("Votre accord est enregistré et la demande passe à l'étape suivante.")).toBeVisible();
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
  await expect(item).toHaveCount(0);

  // It is now among what the manager decided, and waits for HR.
  await page.goto("/team/requests?view=decided");
  await expect(row(page, EMPLOYEE.name, day)).toContainText("en attente des RH");
});
