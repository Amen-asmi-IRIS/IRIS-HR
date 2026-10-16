import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";

const COLUMNS = [
  "Matricule",
  "Nom",
  "Département",
  "Congé annuel (jours)",
  "Congé maladie (jours)",
  "Congé exceptionnel (jours)",
  "Permissions (heures)",
  "Télétravail (jours)",
  "Solde annuel en fin de période",
  "Tickets restaurant",
];

test("HR prepares the figures for KPMG with one export", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 12));

  // One remote day for Amal, approved by her manager and validated by HR.
  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);

  // Reports, KPMG export: the page says what the file will contain and by which rules.
  await page.goto("/hr/reports");
  await page.getByRole("link", { name: "Export KPMG", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Export KPMG", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Colonnes du fichier" }).getByRole("listitem")).toHaveText(COLUMNS);
  await expect(page.getByRole("list", { name: "Règles appliquées" }).getByRole("listitem")).toHaveCount(3);

  // The period is the one day of the request. The end is set first so that it never precedes the start.
  await page.getByLabel("Au", { exact: true }).fill(day);
  await page.getByLabel("Du", { exact: true }).fill(day);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter vers Excel", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`kpmg_${day}_${day}.xlsx`);
  await expect(page.getByText("Le fichier a été téléchargé.")).toBeVisible();

  // The file: the ten columns of REP-04, one row per employee, and Amal's remote day.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
  expect(cells(1)).toEqual(COLUMNS);
  let amal: unknown[] | null = null;
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    if (cells(row)[1] === EMPLOYEE.name) amal = cells(row);
  }
  expect(amal, "Amal's row is in the file").not.toBeNull();
  expect(amal![7]).toBe(1); // remote work, in days
  expect(amal!.slice(3, 7)).toEqual([0, 0, 0, 0]); // no leave and no permission that day
  expect(amal![9]).toBe(21); // remote work does not reduce meal tickets

  // The export is in the activity log, with who made it.
  await page.goto("/hr/reports/activity");
  const exported = page
    .getByRole("main")
    .locator("tbody tr, ul[aria-label] > li")
    .filter({ hasText: "Export KPMG" })
    .filter({ hasText: HR.name });
  await expect(exported.first()).toBeVisible();
});
