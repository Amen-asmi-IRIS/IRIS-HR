import { expect, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Sign in as a demo account ("employee.a1", "manager.a", "hr", "ceo") and wait until the session is open. */
export async function enter(page: Page, name: string): Promise<void> {
  await signIn(page, `${name}@impactrisks.com`);
  await expect(page).not.toHaveURL(/\/login/);
}

function iso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface FeedEntry {
  employee: { public_id: string; name: string };
  start_date: string;
  label: string;
  type_code: string | null;
  type_name: string | null;
  status: string | null;
  request_public_id: string | null;
  mine: boolean;
}

/** The calendar feed for the next 30 days, read with the page's own session. */
export async function readFeed(page: Page, scope: string, extra = ""): Promise<{ entries: FeedEntry[] }> {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  const url = `/api/v1/calendar?from=${iso(from)}&to=${iso(to)}&scope=${scope}${extra}`;
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { entries: FeedEntry[] };
}
