import { expect, test, type Page } from "@playwright/test";
import { EMPLOYEE, HR, OTHER_MANAGER } from "./people";
import { approveAsManager, become, OUTSIDER, ownWeek, tuesday, validateAsHr } from "./requests";

interface BalanceBody {
  employee: { public_id: string; name: string };
  current: string;
  approved_upcoming: string;
  has_opening: boolean;
}
interface MeBody {
  employee: { public_id: string } | null;
}
interface RequestBody {
  public_id: string;
  version: number;
}

/** "17.50" -> a pattern for "17,5 jours" (the pages are in French here), not inside a longer number. */
function inDays(value: string): RegExp {
  const amount = String(Number(value)).replace("-", "[-−]").replace(".", ",");
  return new RegExp(`(^|[^0-9,])${amount}\\s*jours?`);
}

async function csrf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
}

/** A call to the API as the signed-in person: the browser's session and CSRF token. */
async function call<T>(page: Page, method: string, url: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(url, { method, data, headers: { "X-CSRFToken": await csrf(page) } });
  expect(response.ok(), `${method} ${url} answered ${response.status()}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function ownEmployeeId(page: Page): Promise<string> {
  const me = await call<MeBody>(page, "GET", "/api/v1/auth/me");
  expect(me.employee, "the account has an employee record").not.toBeNull();
  return (me.employee as { public_id: string }).public_id;
}

test("an employee reads their balance and opens the history", async ({ page }) => {
  await become(page, null, EMPLOYEE);
  const balance = await call<BalanceBody>(page, "GET", `/api/v1/balances/${await ownEmployeeId(page)}`);

  await page.getByRole("link", { name: "Solde", exact: true }).first().click();
  await expect(page).toHaveURL(/\/me\/balance$/);

  await expect(page.getByRole("region", { name: "Solde de congés annuels" })).toContainText(inDays(balance.current));
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  // `visible: true`: the shared table keeps nothing hidden today, but a line must be seen, not only present
  await expect(page.getByText("Solde d'ouverture", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // Written as text: the journeys are compiled without the browser's types.
  const fitsTheScreen = await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth");
  expect(fitsTheScreen, "the page does not scroll sideways").toBe(true);
});

test("HR records an opening balance, the employee books leave, the balance and the history show it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "This journey changes the balance of one person; it runs once, on the desktop.");
  const day = tuesday(ownWeek(testInfo, 10));

  // 1. HR records the opening balance of the one demo employee who has none, from the employee record.
  await become(page, null, HR);
  const search = await call<{ results: { public_id: string }[] }>(page, "GET", `/api/v1/employees?search=${OUTSIDER.email}`);
  expect(search.results, "the demo cast has employee.b1").toHaveLength(1);
  const employeeId = search.results[0].public_id;
  const atFirst = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);

  await page.goto(`/hr/employees/${employeeId}`);
  await expect(page.getByText("Solde annuel", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Solde", exact: true }).click();
  const record = page.getByRole("button", { name: "Saisir le solde d'ouverture", exact: true });
  if (atFirst.has_opening) {
    // A second attempt of this journey (the pipeline retries once): the first one recorded it.
    expect(testInfo.retry, "the demo data leaves employee.b1 without an opening balance").toBeGreaterThan(0);
  } else {
    await record.click();
    const sheet = page.getByRole("dialog", { name: `Solde d'ouverture : ${OUTSIDER.name}` });
    await sheet.getByLabel("Solde d'ouverture (jours)").fill("10");
    await sheet.getByLabel("Motif").fill("Reliquat du dossier 2025");
    await sheet.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Solde mis à jour.")).toBeVisible();
  }
  await expect(page.getByText("Solde d'ouverture", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(record).toHaveCount(0);
  const withOpening = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);
  if (!atFirst.has_opening) expect(Number(withOpening.current)).toBe(Number(atFirst.current) + 10);

  // 2. The employee sees the new balance.
  await become(page, HR, OUTSIDER);
  await page.goto("/me/balance");
  await expect(page.getByRole("region", { name: "Solde de congés annuels" })).toContainText(inDays(withOpening.current));

  // 3. The employee asks for a day of annual leave; the form belongs to plan 03b's journeys, so the API is used here.
  const draft = await call<RequestBody>(page, "POST", "/api/v1/requests", {
    type: "annual",
    start_date: day,
    end_date: day,
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    exceptional_event: null,
    comment: "",
  });
  await call(page, "POST", `/api/v1/requests/${draft.public_id}/submit`, { version: draft.version });

  // 4. The line manager, then HR, approve it in their queues.
  await become(page, OUTSIDER, OTHER_MANAGER);
  await approveAsManager(page, OUTSIDER.name, day);
  await become(page, OTHER_MANAGER, HR);
  await validateAsHr(page, OUTSIDER.name, day);

  // 5. The day is approved and upcoming, the balance today has not moved, and the history leads back to the request.
  await become(page, HR, OUTSIDER);
  const afterwards = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);
  expect(Number(afterwards.approved_upcoming)).toBeGreaterThanOrEqual(1);
  expect(Number(afterwards.current)).toBe(Number(withOpening.current));

  await page.goto("/me/balance");
  const summary = page.getByRole("region", { name: "Solde de congés annuels" });
  await expect(summary.getByText("Approuvés à venir", { exact: true })).toBeVisible();
  await expect(summary).toContainText(inDays(afterwards.approved_upcoming));
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(page.getByText("Congé pris", { exact: true }).first()).toBeVisible();
  await expect(page.locator(`a[href="/requests/${draft.public_id}"]`)).toHaveText("Voir la demande");
});
