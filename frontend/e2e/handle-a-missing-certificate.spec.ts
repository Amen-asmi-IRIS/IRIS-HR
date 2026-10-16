import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR } from "./people";
import { askFor, become, pastWeek, row, tuesday } from "./requests";

test("HR counts a sick day without certificate as annual leave", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 1));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Congé maladie", day);

  await become(page, EMPLOYEE, HR);
  await page.goto("/hr");
  const block = page.getByRole("region", { name: "Certificats" });
  await expect(block.getByText(/En retard : \d+ · À fournir : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : Certificats", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/certificates$/);

  const line = row(page, EMPLOYEE.name, day);
  await expect(line).toContainText("Dans les délais");
  await line.getByRole("button", { name: "Compter en congé annuel", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Compter l'arrêt en congé annuel" });
  await expect(
    sheet.getByText(`La demande devient un congé annuel, validé par les RH. Ces jours sont déduits du solde de ${EMPLOYEE.name}.`),
  ).toBeVisible();

  // When the balance does not cover the day, the sheet asks why an exception is granted.
  const confirm = sheet.getByRole("button", { name: "Compter en congé annuel", exact: true });
  const reason = sheet.getByLabel("Motif de l'exception", { exact: true });
  const done = page.getByText("Arrêt compté en congé annuel.");
  await confirm.click();
  await expect(done.or(reason)).toBeVisible();
  if (await reason.isVisible()) {
    await reason.fill("Certificat jamais fourni");
    await confirm.click();
  }
  await expect(done).toBeVisible();
  await expect(line).toHaveCount(0);

  // The same request is now an approved annual leave.
  await page.goto("/hr/requests");
  const request = row(page, EMPLOYEE.name, day);
  await expect(request).toContainText("Congé annuel");
  await expect(request).toContainText("Approuvée");
});
