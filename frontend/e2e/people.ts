import { expect, type Page, type TestInfo } from "@playwright/test";

import { uniqueEmail } from "./helpers";

/** The demo people of `apps/organisation/seed.py`. Each signs in with `PASSWORD`. */
export const HR = { email: "hr@impactrisks.com", name: "Senna RH" };
export const MANAGER = { email: "manager.a@impactrisks.com", name: "Mounir Manager" };
export const OTHER_MANAGER = { email: "manager.b@impactrisks.com", name: "Nadia Manager" };
export const EMPLOYEE = { email: "employee.a1@impactrisks.com", name: "Amal Employee" };

/** A short text no other run has used: the two projects share one database. */
export function stamp(testInfo: TestInfo): string {
  return `${testInfo.project.name}-${Date.now().toString(36)}`;
}

/** Waits until the sign-in has led somewhere, so that the next `goto` does not interrupt it. */
export async function landed(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
}

export interface NewPerson {
  number: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** An employee nobody has entered yet. */
export function newPerson(testInfo: TestInfo, firstName: string): NewPerson {
  return {
    number: `T${Date.now().toString(36).toUpperCase()}`,
    firstName,
    lastName: `Essai ${stamp(testInfo)}`,
    email: uniqueEmail(testInfo, firstName.toLowerCase()),
  };
}

export function fullName(person: NewPerson): string {
  return `${person.firstName} ${person.lastName}`;
}

/**
 * As HR, in French: enters an employee of "Souscription" who reports to Mounir Manager, or to the manager named as
 * the picker shows them ("Name · Department"), and ends on the new record.
 */
export async function createEmployee(page: Page, person: NewPerson, manager = "Mounir Manager · Souscription"): Promise<void> {
  await page.goto("/hr/employees");
  await page.getByRole("link", { name: "Nouvel employé", exact: true }).click();
  await page.getByLabel("Matricule", { exact: true }).fill(person.number);
  await page.getByLabel("Prénom", { exact: true }).fill(person.firstName);
  await page.getByLabel("Nom", { exact: true }).fill(person.lastName);
  await page.getByLabel("E-mail professionnel", { exact: true }).fill(person.email);
  await page.getByLabel("Date d'embauche", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Type de contrat", { exact: true }).selectOption({ label: "CDI" });
  await page.getByLabel("Département", { exact: true }).selectOption({ label: "Souscription" });
  await page.getByLabel("Poste", { exact: true }).selectOption({ label: "Chargé de clientèle" });
  await page.getByLabel("Responsable", { exact: true }).selectOption({ label: manager });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: fullName(person), exact: true })).toBeVisible();
}
