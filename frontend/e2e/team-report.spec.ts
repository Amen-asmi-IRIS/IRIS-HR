import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";

test("a manager reads and exports a report about the team", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 13));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);
  await become(page, HR, MANAGER);

  // My team, Reports: five reports about the team, none about certificates.
  await page.goto("/team/reports");
  await expect(page.getByText("Ces rapports portent sur votre équipe.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Certificats en attente/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export KPMG", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^Absences prises/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Absences prises", exact: true })).toBeVisible();

  // No department filter in My team; the period narrows the result to the day of the request.
  await expect(page.getByRole("combobox", { name: "Département" })).toHaveCount(0);
  await page.getByLabel("Au", { exact: true }).fill(day);
  await page.getByLabel("Du", { exact: true }).fill(day);
  const result = page.getByRole("region", { name: "Résultat : Absences prises" });
  const line = result.getByRole("row").filter({ hasText: EMPLOYEE.name }).filter({ hasText: "Télétravail" });
  await expect(line).toHaveCount(1);

  // The selection is in the address: it survives a reload.
  await page.reload();
  await expect(line).toHaveCount(1);
  await expect(page.getByLabel("Du", { exact: true })).toHaveValue(day);

  // The download is what is shown.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exporter vers Excel", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^absences_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
  expect(cells(1)).toEqual(["Salarié", "Département", "Type", "Du", "Au", "Jours", "Heures"]);
  expect(cells(2)[0]).toBe(EMPLOYEE.name);
  expect(cells(2)[2]).toBe("Télétravail");
  expect(cells(2)[5]).toBe(1);
});
