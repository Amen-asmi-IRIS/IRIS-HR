import { expect, test } from "@playwright/test";
import { MANAGER, OTHER_MANAGER } from "./people";
import { become } from "./requests";

test("a manager whose leave is approved names a delegate for those dates", async ({ page }) => {
  // The demo data holds an approved annual leave of this manager, about three weeks ahead.
  await become(page, null, MANAGER);
  await page.goto("/me/requests?status=approved&type=annual");
  await page.getByRole("button", { name: "Congé annuel", exact: true }).first().click();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText("Approuvée", { exact: true })).toBeVisible();

  // The offer leads to the delegation, with the dates of the leave already filled in.
  await summary.getByRole("link", { name: "Nommer un délégué pour ces dates", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/delegations\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  const dates = new URL(page.url()).searchParams;
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Premier jour", { exact: true })).toHaveValue(dates.get("from") ?? "");
  await expect(sheet.getByLabel("Dernier jour", { exact: true })).toHaveValue(dates.get("to") ?? "");
  await sheet.getByLabel("Délégué", { exact: true }).selectOption({ label: `${OTHER_MANAGER.name} · Sinistres` });
  await sheet.getByRole("button", { name: "Nommer le délégué", exact: true }).click();
  await expect(page.getByText("Délégué nommé.")).toBeVisible();

  // Left as found, for the other project and for plan 02's own delegation journey.
  await page.getByRole("button", { name: "Annuler la délégation", exact: true }).click();
  await page.getByRole("button", { name: "Oui, annuler", exact: true }).click();
  await expect(page.getByText("Délégation terminée.")).toBeVisible();
});
