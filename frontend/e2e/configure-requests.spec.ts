import { expect, test } from "@playwright/test";
import { HR, stamp } from "./people";
import { become, row } from "./requests";

const thisYear = new Date().getFullYear();
// The demo holds the fixed holidays of this year and the next; the journeys of requests never reach two years ahead.
const later = thisYear + 2;

test("HR sets up holidays, a type, its steps and an event, and each is kept", async ({ page }, testInfo) => {
  const mark = stamp(testInfo);
  // A day of its own for each project and attempt: the two projects share one database.
  const day = `${later}-06-${String(13 + (testInfo.project.name === "phone" ? 1 : 0) + 2 * testInfo.retry).padStart(2, "0")}`;

  await become(page, null, HR);

  // A public holiday. Typed on the day of an approved request, the sheet says that request keeps its count.
  const approved = await page.request.get("/api/v1/requests?scope=all&status=approved");
  expect(approved.ok()).toBe(true);
  const covered = ((await approved.json()) as { results: { start_date: string; employee: { name: string } }[] }).results[0];
  await page.goto(`/hr/settings/holidays?year=${later}`);
  await page.getByRole("button", { name: "Nouveau jour férié", exact: true }).click();
  const holiday = page.getByRole("dialog", { name: "Nouveau jour férié" });
  await holiday.getByLabel("Date", { exact: true }).fill(covered.start_date);
  const impact = holiday.getByRole("status").filter({ hasText: "Des demandes déjà approuvées couvrent ce jour." });
  await expect(impact).toContainText(covered.employee.name);
  await holiday.getByLabel("Date", { exact: true }).fill(day);
  await expect(impact).toHaveCount(0);
  await holiday.getByLabel("Nom en français", { exact: true }).fill(`Fête ${mark}`);
  await holiday.getByLabel("Nom en anglais", { exact: true }).fill(`Holiday ${mark}`);
  await holiday.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Jour férié enregistré.")).toBeVisible();
  await page.reload();
  await expect(row(page, `Fête ${mark}`, day)).toContainText("Cette année seulement");

  // The fixed holidays of next year are copied to the year after.
  await page.goto(`/hr/settings/holidays?year=${thisYear + 1}`);
  await page.getByRole("button", { name: `Copier les jours à date fixe vers ${later}`, exact: true }).click();
  await expect(page.getByText(new RegExp(`^Jours fériés copiés vers ${later} : \\d+\\.$`))).toBeVisible();
  await page.goto(`/hr/settings/holidays?year=${later}`);
  await expect(row(page, "Fête du Travail", `${later}-05-01`)).toContainText("Chaque année, à la même date");

  // The description of a type.
  await page.goto("/hr/settings/request-types");
  await page.getByRole("button", { name: "Autorisation de sortie", exact: true }).click();
  let type = page.getByRole("dialog", { name: "Modifier : Autorisation de sortie" });
  await type.getByLabel("Description en français", { exact: true }).fill(`Quelques heures, ${mark}`);
  await type.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Type enregistré.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Autorisation de sortie", exact: true }).click();
  type = page.getByRole("dialog", { name: "Modifier : Autorisation de sortie" });
  await expect(type.getByLabel("Description en français", { exact: true })).toHaveValue(`Quelques heures, ${mark}`);
  await type.getByRole("button", { name: "Annuler", exact: true }).click();

  // A step added at the end and moved to the front: the manager is told first.
  await type.waitFor({ state: "detached" });
  await page.goto("/hr/settings/request-types");
  await page.getByRole("button", { name: "Autorisation de sortie", exact: true }).click();
  await page.getByRole("link", { name: "Voir les étapes de ce type", exact: true }).click();
  await expect(page.getByLabel("Type de demande", { exact: true }).locator("option:checked")).toHaveText("Autorisation de sortie");
  const steps = page.getByRole("group", { name: /^Étape \d+$/ });
  // The saved steps are read after the types: count them once they are drawn.
  await expect(page.getByRole("group", { name: "Étape 1", exact: true })).toBeVisible();
  const before = await steps.count();
  await page.getByRole("button", { name: "Ajouter une étape", exact: true }).click();
  await expect(steps).toHaveCount(before + 1);
  const added = page.getByRole("group", { name: `Étape ${before + 1}`, exact: true });
  await added.getByLabel("Qui agit", { exact: true }).selectOption({ label: "Le responsable" });
  await added.getByLabel("Rôle", { exact: true }).selectOption({ label: "Est seulement informé" });
  for (let position = before + 1; position > 1; position -= 1) {
    await page.getByRole("group", { name: `Étape ${position}`, exact: true }).getByRole("button", { name: "Monter", exact: true }).click();
  }
  await page.getByRole("button", { name: "Enregistrer les étapes", exact: true }).click();
  await expect(page.getByText("Étapes enregistrées.")).toBeVisible();
  await page.reload();
  await expect(steps).toHaveCount(before + 1);
  const first = page.getByRole("group", { name: "Étape 1", exact: true });
  await expect(first.getByLabel("Qui agit", { exact: true })).toHaveValue("line_manager");
  await expect(first.getByLabel("Rôle", { exact: true })).toHaveValue("notify");

  // An exceptional event.
  await page.goto("/hr/settings/events");
  await page.getByRole("button", { name: "Nouvel événement", exact: true }).click();
  const event = page.getByRole("dialog", { name: "Nouvel événement" });
  await event.getByLabel("Nom en français", { exact: true }).fill(`Déménagement ${mark}`);
  await event.getByLabel("Nom en anglais", { exact: true }).fill(`House move ${mark}`);
  await event.getByLabel("Jours accordés", { exact: true }).fill("1,5");
  await event.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Événement enregistré.")).toBeVisible();
  await page.reload();
  const line = page.getByRole("main").locator("tbody tr, ul[aria-label] > li").filter({ hasText: `Déménagement ${mark}` });
  await expect(line).toContainText("1,5 jour");
  await line.getByRole("button", { name: `Déménagement ${mark}`, exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: `Modifier : Déménagement ${mark}` }).getByLabel("Nom en anglais", { exact: true }),
  ).toHaveValue(`House move ${mark}`);
});
