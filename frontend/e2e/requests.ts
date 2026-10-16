import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { PASSWORD, signIn, signOut } from "./helpers";
import { landed } from "./people";

/** Chokri Employee reports to Nadia Manager, in the other department. */
export const OUTSIDER = { email: "employee.b1@impactrisks.com", name: "Chokri Employee" };

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

/** The demo public holidays (`apps/calendar/seed.py`), as month and day. */
const DEMO_HOLIDAYS = ["01-01", "03-20", "04-09", "05-01", "07-25", "08-13", "10-15", "12-17"];

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The Tuesday `weeks` weeks after the coming one (before it when negative), as the date inputs
 * take it. When that Tuesday is a demo holiday, the Wednesday: every journey needs a working day.
 */
export function tuesday(weeks: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((9 - date.getUTCDay()) % 7) + weeks * 7);
  if (DEMO_HOLIDAYS.includes(iso(date).slice(5))) date.setUTCDate(date.getUTCDate() + 1);
  return iso(date);
}

const second = (testInfo: TestInfo) => (testInfo.project.name === "phone" ? 1 : 0);

/**
 * Weeks further for a second attempt (the pipeline retries a failed journey once): the request of the first
 * attempt may have been sent, and the same day asked again would overlap it.
 */
const again = (testInfo: TestInfo) => 40 * testInfo.retry;

/** A future week of its own for a journey and a project, beyond the weeks the demo data uses. */
export function ownWeek(testInfo: TestInfo, journey: number): number {
  return 6 + 2 * journey + second(testInfo) + again(testInfo);
}

/** A past week of its own, for a sick leave: `tuesday(-1)` is always behind us. */
export function pastWeek(testInfo: TestInfo, journey: number): number {
  return -(1 + 2 * journey + second(testInfo) + again(testInfo));
}

/** A date as the pages write it in French (`formatDate` of `src/lib/format.ts`): "17 nov. 2026". */
export function frDate(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/**
 * A text that holds this day as a whole date. A plain text filter would also find "6 oct. 2026" inside
 * "26 oct. 2026", the end of another request of the same person.
 */
function onDay(day: string): RegExp {
  const date = frDate(day).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9])${date}`);
}

/** The row of a table, or its card on a phone, that carries this text and this day. */
export function row(page: Page, text: string, day: string): Locator {
  return page
    .getByRole("main")
    .locator("tbody tr, ul[aria-label] > li")
    .filter({ hasText: text })
    .filter({ hasText: onDay(day) });
}

/** The item of the To decide list about this person's request for this day. */
export function toDecide(page: Page, name: string, day: string): Locator {
  return page.getByRole("main").getByRole("article").filter({ hasText: name }).filter({ hasText: onDay(day) });
}

/** Leaves the current account, if any, and signs in as someone else, in French. */
export async function become(page: Page, from: { name: string } | null, to: { email: string }): Promise<void> {
  if (from) await signOut(page, from.name, "fr");
  await signIn(page, to.email, PASSWORD, "fr");
  await landed(page);
}

/** As the signed-in employee: asks for one day of a type from My space, and ends on the request sent. */
export async function askFor(page: Page, type: string, day: string): Promise<void> {
  await page.goto("/me/requests");
  await page.getByRole("link", { name: "Nouvelle demande", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`^${type}`) }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  // The server counted one working day: the day is neither a weekend nor a holiday.
  await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Résumé de la demande" })).toBeVisible();
}

async function confirmApproval(page: Page, name: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${name} approuvée.`)).toBeVisible();
}

/** As the signed-in manager: approves this person's request for this day from the To decide list. */
export async function approveAsManager(page: Page, name: string, day: string): Promise<void> {
  await page.goto("/team");
  const item = toDecide(page, name, day);
  await item.getByRole("button", { name: "Approuver", exact: true }).click();
  await confirmApproval(page, name);
  await expect(item).toHaveCount(0);
}

/** As signed-in HR: approves this person's request for this day from the To validate queue. */
export async function validateAsHr(page: Page, name: string, day: string): Promise<void> {
  await page.goto("/hr/validate");
  const line = row(page, name, day);
  await line.getByRole("button", { name: "Approuver", exact: true }).click();
  await confirmApproval(page, name);
  await expect(line).toHaveCount(0);
}
