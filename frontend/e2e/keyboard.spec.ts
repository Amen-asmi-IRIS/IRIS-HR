import { expect, test } from "@playwright/test";

import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, row, toDecide, tuesday } from "./requests";
import { tabTo } from "./support/checks";

test.describe("keyboard only", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "a phone has no Tab key");

  test("ask for leave from the home page", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 20));
    await become(page, null, EMPLOYEE);
    await page.goto("/me");

    await tabTo(page, page.getByRole("link", { name: "Nouvelle demande" }).first());
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Quel type de demande ?", exact: true })).toBeVisible();

    await tabTo(page, page.getByRole("link", { name: /^Télétravail/ }));
    await page.keyboard.press("Enter");

    await tabTo(page, page.getByLabel("Début", { exact: true }));
    await page.locator(":focus").fill(day);
    await tabTo(page, page.getByLabel("Fin", { exact: true }));
    await page.locator(":focus").fill(day);
    await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();

    await tabTo(page, page.getByRole("button", { name: "Envoyer", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("Demande envoyée.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Résumé de la demande" }).getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  });

  test("decide a request from the list", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 21));
    await become(page, null, EMPLOYEE);
    await askFor(page, "Télétravail", day);

    await become(page, EMPLOYEE, MANAGER);
    await page.goto("/team");
    const item = toDecide(page, EMPLOYEE.name, day);
    await tabTo(page, item.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
    await expect(sheet).toBeVisible();
    // The focus is inside the sheet as soon as it opens, and Tab stays inside it.
    expect(await page.evaluate(`Boolean(document.activeElement?.closest('[role="dialog"]'))`)).toBe(true);
    await tabTo(page, sheet.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
    await expect(item).toHaveCount(0);
    // The focus was not dropped on the body: the next Tab continues from the page.
    expect(await page.evaluate("document.activeElement?.tagName")).not.toBe("BODY");
  });

  test("validate a request from the queue", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 22));
    await become(page, null, EMPLOYEE);
    await askFor(page, "Télétravail", day);
    await become(page, EMPLOYEE, MANAGER);
    await approveAsManager(page, EMPLOYEE.name, day);

    await become(page, MANAGER, HR);
    await page.goto("/hr/validate");
    const line = row(page, EMPLOYEE.name, day);
    await tabTo(page, line.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
    await tabTo(page, sheet.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
    await expect(line).toHaveCount(0);
  });

  test("the first Tab on a page offers a way past the navigation", async ({ page }) => {
    await become(page, null, HR);
    await page.goto("/hr/employees");
    await expect(page.getByRole("main")).toBeVisible();
    await page.keyboard.press("Tab");
    const first = page.locator(":focus");
    const insideMain = await first.evaluate((element) => Boolean(element.closest("main")));
    const isSkipLink = await first.evaluate((element) => element.tagName === "A" && (element.getAttribute("href") ?? "").startsWith("#"));
    expect(insideMain || isSkipLink, "the first focusable element is neither a skip link nor inside the content").toBe(true);
  });
});
