import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut } from "./helpers";
import { landed, MANAGER, OTHER_MANAGER } from "./people";

/** A day counted from today, as the date inputs take it. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

test("a manager names a delegate, the delegate sees it, the manager cancels it", async ({ page }, testInfo) => {
  // Each project takes its own week, so that a delegation left by one cannot overlap the other's.
  const first = testInfo.project.name === "phone" ? 40 : 30;
  const cancel = page.getByRole("button", { name: "Annuler la délégation", exact: true });

  await signIn(page, MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  await page.getByRole("button", { name: "Nommer un délégué", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Délégué", { exact: true }).selectOption({ label: `${OTHER_MANAGER.name} · Sinistres` });
  await sheet.getByLabel("Premier jour", { exact: true }).fill(day(first));
  await sheet.getByLabel("Dernier jour", { exact: true }).fill(day(first + 4));
  await sheet.getByRole("button", { name: "Nommer le délégué", exact: true }).click();
  await expect(page.getByText("Délégué nommé.")).toBeVisible();
  await expect(cancel).toBeVisible();
  await signOut(page, MANAGER.name, "fr");

  // The delegate finds it among the delegations received.
  await signIn(page, OTHER_MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  const received = page.getByRole("region", { name: "Délégations reçues" });
  await expect(received.getByText(MANAGER.name).first()).toBeVisible();
  await expect(received.getByText("À venir").first()).toBeVisible();
  await expect(cancel).toHaveCount(0);
  await signOut(page, OTHER_MANAGER.name, "fr");

  // The manager cancels it, after the consequence is stated.
  await signIn(page, MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  await cancel.click();
  await expect(page.getByText(`La délégation à ${OTHER_MANAGER.name} n'aura pas lieu.`)).toBeVisible();
  await page.getByRole("button", { name: "Oui, annuler", exact: true }).click();
  await expect(page.getByText("Délégation terminée.")).toBeVisible();
  await expect(cancel).toHaveCount(0);
  await expect(page.getByText("Annulée").first()).toBeVisible();
});
