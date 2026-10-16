import { expect, test } from "@playwright/test";

import { enter } from "./calendar-homes";

const BLOCKS = [/Absents en ce moment/, /Absences ce mois-ci/, /Congés acquis/, /En attente/];

test("an executive checks that nothing is stuck", async ({ page }) => {
  await enter(page, "ceo");
  await page.goto("/overview");

  // The four blocks of the Overview home, and nothing to act on in any of them.
  for (const name of BLOCKS) {
    const block = page.getByRole("region", { name });
    await expect(block).toBeVisible();
    await expect(block.getByRole("button")).toHaveCount(0);
  }

  // The Waiting block lists requests, oldest first, or says that nothing waits.
  const waiting = page.getByRole("region", { name: /En attente/ });
  const lines = waiting.getByRole("link");
  await expect(lines.first().or(waiting.getByText("Aucune demande n'attend de décision."))).toBeVisible();

  if ((await lines.count()) > 0) {
    // Opening a line shows the request. Under Overview it is read-only.
    await lines.first().click();
    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}/);
    if (page.url().includes("/overview/")) {
      await expect(page.getByRole("button", { name: /approuver|refuser|renvoyer/i })).toHaveCount(0);
    }
  }
});
