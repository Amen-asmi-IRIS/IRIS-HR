import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import { PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";
import { HR, MANAGER, createEmployee, fullName, landed, newPerson } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";
import { apiOf } from "./support/session";

const OWN_PASSWORD = "Nouveau-Cheval-2026!";

test("journey 15: from a new employee's first sign-in to the KPMG file", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const person = newPerson(testInfo, "Lina");
  const name = fullName(person);
  const day = tuesday(ownWeek(testInfo, 14));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  let employeeId = "";
  let temporary = "";

  // Someone hired on or after the credit start date has no opening balance (master D50): their monthly
  // credits are their balance, and days brought from elsewhere go in as an adjustment.
  await test.step("HR enters the record and the days the person brings (go-live steps 3 and 4)", async () => {
    await signIn(page, HR.email, PASSWORD, "fr");
    await landed(page);
    await createEmployee(page, person);                                        // ends on the new record
    employeeId = new URL(page.url()).pathname.split("/").pop()!;
    await apiOf(page).send("post", `/balances/${employeeId}/adjustments`,
      { kind: "adjustment", amount: "10.00", effective_date: yesterday, reason: "Jours repris de l'ancien employeur" });
    await signOut(page, HR.name, "fr");
  });

  await test.step("the administrator creates the account (go-live step 5)", async () => {
    await signIn(page, SYSADMIN.email, PASSWORD, "fr");
    await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Créer un compte", exact: true }).click();
    await page.getByLabel("Employé", { exact: true }).selectOption({ label: name });
    await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
    const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
    await expect(result).toBeVisible();
    temporary = (await result.locator("p").first().innerText()).trim();
    await page.getByRole("button", { name: "Terminé", exact: true }).click();
    await signOut(page, SYSADMIN.name, "fr");
  });

  await test.step("the employee chooses a password and finds a balance of ten days", async () => {
    await signIn(page, person.email, temporary, "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true })).toBeVisible();
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
    await page.getByLabel("Confirmez le nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
    await page.getByRole("button", { name: "Enregistrer le mot de passe", exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);                                     // one workspace: My space, on its home
    await expect(page.getByRole("region", { name: "Solde" }).getByText(/^10 jours$/).first()).toBeVisible();
  });

  await test.step("the employee asks for one day of annual leave", async () => {
    await askFor(page, "Congé annuel", day);
    await expect(page.getByRole("region", { name: "Résumé de la demande" }).getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  });

  await test.step("the manager approves, HR validates", async () => {
    await become(page, { name }, MANAGER);
    await approveAsManager(page, name, day);
    await become(page, MANAGER, HR);
    await validateAsHr(page, name, day);
  });

  await test.step("the balance, the history and the KPMG file agree", async () => {
    const api = apiOf(page);                                                   // the HR session
    const balance = await api.get<{ current: string; approved_upcoming: string; pending: string }>(`/balances/${employeeId}`);
    expect(Number(balance.current)).toBe(10);                                  // the leave is still ahead
    expect(Number(balance.approved_upcoming)).toBe(1);
    expect(Number(balance.pending)).toBe(0);

    const requests = await api.get<{ count: number; results: { public_id: string }[] }>("/requests", { scope: "all", employee: employeeId });
    expect(requests.count).toBe(1);
    const history = await api.get<{ at: string; actor: string | null; action: string }[]>(`/requests/${requests.results[0].public_id}/history`);
    expect(history.filter((entry) => entry.action === "step.decided")).toHaveLength(2);
    expect(history.every((entry) => entry.at && entry.actor)).toBe(true);  // who and when, for every line

    // The file's balance is the balance on the last day of the period: what is posted by then, the day taken
    // included, and the month-end credits due by then (the demo data sets a credit start date, master 13.1).
    const onTheDay = await api.get<{ as_of: { balance: string } }>(`/balances/${employeeId}`, { on: day });

    await page.goto("/hr/reports");
    await page.getByRole("link", { name: "Export KPMG", exact: true }).click();
    await page.getByLabel("Au", { exact: true }).fill(day);
    await page.getByLabel("Du", { exact: true }).fill(day);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter vers Excel", exact: true }).click();
    const download = await downloading;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await download.path());
    const sheet = workbook.worksheets[0];
    const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
    let line: unknown[] | null = null;
    for (let row = 2; row <= sheet.rowCount; row += 1) {
      if (cells(row)[1] === name) line = cells(row);
    }
    expect(line, `${name} is in the file`).not.toBeNull();
    expect(line![0]).toBe(person.number);
    expect(line![3]).toBe(1);                                                  // annual leave, in days
    expect(line![8]).toBe(Number(onTheDay.as_of.balance));                     // balance on the last day of the period
    expect(Number(onTheDay.as_of.balance)).toBeGreaterThanOrEqual(9);          // ten brought, one taken, credits on top
    expect(line![9]).toBe(20);                                                 // 21 meal tickets less one full day
  });
});
