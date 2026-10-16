import { expect, type Page, type TestInfo } from "@playwright/test";

export const PASSWORD = "Correct-Horse-42!";
export const SYSADMIN = { email: "sysadmin@impactrisks.com", name: "Sonia Admin" };

const TEXT = {
  fr: {
    language: "Français",
    email: "Adresse e-mail professionnelle",
    password: "Mot de passe",
    submit: "Se connecter",
    title: "Connexion",
    signOut: "Se déconnecter",
    menu: (name: string) => `Menu de ${name}`,
  },
  en: {
    language: "English",
    email: "Professional email",
    password: "Password",
    submit: "Sign in",
    title: "Sign in",
    signOut: "Sign out",
    menu: (name: string) => `Menu of ${name}`,
  },
} as const;

export type Lang = keyof typeof TEXT;

/** Fills the sign-in form that is on screen, in the given language. */
export async function fillSignIn(page: Page, email: string, password: string = PASSWORD, lang: Lang = "fr"): Promise<void> {
  await page.getByRole("button", { name: TEXT[lang].language, exact: true }).click();
  await page.getByLabel(TEXT[lang].email, { exact: true }).fill(email);
  await page.getByLabel(TEXT[lang].password, { exact: true }).fill(password);
  await page.getByRole("button", { name: TEXT[lang].submit, exact: true }).click();
}

export async function signIn(page: Page, email: string, password: string = PASSWORD, lang: Lang = "fr"): Promise<void> {
  await page.goto("/login");
  await fillSignIn(page, email, password, lang);
}

export async function signOut(page: Page, name: string, lang: Lang = "fr"): Promise<void> {
  await page.getByRole("button", { name: TEXT[lang].menu(name), exact: true }).click();
  await page.getByRole("menuitem", { name: TEXT[lang].signOut, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: TEXT[lang].title, exact: true })).toBeVisible();
}

/** An address no other run has used: the two projects share one database. */
export function uniqueEmail(testInfo: TestInfo, prefix: string): string {
  return `${prefix}.${testInfo.project.name}.${Date.now().toString(36)}@impactrisks.com`;
}

/** As the signed-in administrator, in French: creates an administrator account and returns its temporary password. */
export async function createAdministrator(page: Page, name: string, email: string): Promise<string> {
  await page.getByRole("link", { name: "Comptes", exact: true }).click();
  await page.getByRole("link", { name: "Créer un compte", exact: true }).first().click();
  await page.getByLabel("Nom", { exact: true }).fill(name);
  await page.getByLabel("Adresse e-mail professionnelle", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: "Administrateur système" }).check();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
  await expect(result).toBeVisible();
  const password = (await result.locator("p").first().innerText()).trim();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  return password;
}
