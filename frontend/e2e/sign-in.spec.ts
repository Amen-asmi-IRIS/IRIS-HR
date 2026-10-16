import { expect, test } from "@playwright/test";
import { fillSignIn, PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";

test("signs in in French, then in English", async ({ page }) => {
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Comptes", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await signOut(page, SYSADMIN.name, "fr");

  await signIn(page, SYSADMIN.email, PASSWORD, "en");
  await expect(page.getByRole("heading", { level: 1, name: "Status", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await signOut(page, SYSADMIN.name, "en");
});

test("refuses a wrong password with one message and keeps the email", async ({ page }) => {
  await signIn(page, SYSADMIN.email, "not-the-password-1", "fr");
  await expect(page.getByRole("alert")).toContainText(/\S/);
  await expect(page.getByLabel("Adresse e-mail professionnelle", { exact: true })).toHaveValue(SYSADMIN.email);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("returns to the page that was asked for, with its filters", async ({ page }) => {
  await page.goto("/admin/accounts?state=locked");
  await expect(page).toHaveURL(/\/login\?next=/);
  await fillSignIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page).toHaveURL(/\/admin\/accounts\?state=locked$/);
  await expect(page.getByRole("heading", { level: 1, name: "Comptes", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "État" })).toHaveValue("locked");
});
