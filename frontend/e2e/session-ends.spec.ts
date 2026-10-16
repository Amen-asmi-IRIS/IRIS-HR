import { expect, test } from "@playwright/test";

import { fillSignIn, PASSWORD } from "./helpers";
import { EMPLOYEE } from "./people";
import { become, ownWeek, row, tuesday } from "./requests";

test("journey 16: the session ends, the user signs in again and finds the page and the draft", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 18));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByRole("button", { name: "Enregistrer pour plus tard", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré.")).toBeVisible();
  await expect(page).toHaveURL(/\/me\/requests$/);

  await page.context().clearCookies();                                         // two hours pass
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);

  await fillSignIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await expect(page).toHaveURL(/\/me\/requests$/);                             // back on the page they were on
  await expect(row(page, "Télétravail", day)).toContainText("Pas encore envoyée");   // the draft was not lost
});

test("journey 16, unsaved: what was typed is still in the form after signing in again", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 17));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByLabel("Commentaire (facultatif)", { exact: true }).fill("Rendez-vous avec le plombier");
  const form = page.url();

  await page.context().clearCookies();                                         // the session ends before Send
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);      // sign-in, not an error page

  await fillSignIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await expect(page).toHaveURL(form);
  await expect(page.getByLabel("Début", { exact: true })).toHaveValue(day);
  await expect(page.getByLabel("Commentaire (facultatif)", { exact: true })).toHaveValue("Rendez-vous avec le plombier");

  // Nothing was sent while signed out; sending now works.
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
});
