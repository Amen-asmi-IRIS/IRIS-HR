import { expect, test } from "@playwright/test";

import { enter, readFeed } from "./calendar-homes";

test.describe("department calendar privacy", () => {
  test("an employee sees a colleague as absent, never why", async ({ page }) => {
    await enter(page, "employee.a1");

    // What the server sends, even when asked for a type: the manager of the department has approved leave.
    const feed = await readFeed(page, "department", "&type=annual&status=approved");
    const colleagues = feed.entries.filter((entry) => !entry.mine);
    expect(colleagues.length).toBeGreaterThan(0);
    for (const entry of colleagues) {
      expect(["absent", "remote"]).toContain(entry.label);
      expect(entry.type_code).toBeNull();
      expect(entry.type_name).toBeNull();
      expect(entry.status).toBeNull();
      expect(entry.request_public_id).toBeNull();
    }

    // What the page shows on the day that colleague is away.
    const away = colleagues.find((entry) => entry.label === "absent") ?? colleagues[0];
    await page.goto(`/me/calendar?date=${away.start_date}`);
    const chip = page.locator("span, a").filter({ hasText: away.employee.name }).filter({ hasText: /Absent|Télétravail/ }).first();
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText(/annuel|maladie|exceptionnel/i);
    await expect(page.getByRole("link", { name: new RegExp(away.employee.name) })).toHaveCount(0);
  });

  test("the manager of that colleague sees the type", async ({ page }) => {
    await enter(page, "ceo");

    const feed = await readFeed(page, "team");
    const leave = feed.entries.find((entry) => entry.type_code === "annual" && entry.status === "approved");
    expect(leave).toBeTruthy();

    await page.goto(`/team/calendar?date=${leave!.start_date}`);
    await expect(page.getByText(new RegExp(`${leave!.employee.name} · ${leave!.type_name}`)).first()).toBeVisible();
  });

  test("an employee is refused the team and company calendars", async ({ page }) => {
    await enter(page, "employee.a1");
    for (const scope of ["team", "company"]) {
      const response = await page.request.get(`/api/v1/calendar?from=2026-01-01&to=2026-01-31&scope=${scope}`);
      const status = response.status();
      expect(status).toBe(403);
    }
  });
});
