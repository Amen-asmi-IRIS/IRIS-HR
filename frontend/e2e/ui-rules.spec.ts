import { type Page, expect, test } from "@playwright/test";

import { type Fixtures, ensureFixtures } from "./support/data";
import { PAGES, resolve } from "./support/pages";
import { type Persona, baseUrlOf, enterAs, open } from "./support/session";

let fixtures: Fixtures;

// eslint-disable-next-line no-empty-pattern -- Playwright passes the fixtures first; none is needed
test.beforeAll(async ({}, testInfo) => {
  fixtures = await ensureFixtures(baseUrlOf(testInfo));
});

// Values the API uses and a person must never read (U3). The French pages are checked, so the English
// words of the list cannot be legitimate text.
const CODES = /\b(waiting_manager|waiting_hr|waiting_person|line_manager|hr_role|named_person|deducts_annual|required_within_deadline|pending|approved|rejected|withdrawn|cancelled|returned|draft)\b/;
// Three report results of UI 10.3 are wider than six columns by definition: the two twelve-month tables, and
// "Requests waiting" (seven in UI 10.3, eight since plan 06 added the days waited). They are drawn by
// `ReportTable`, not as lists of items (plan 06, contract note 18). M4 holds for every other table, the other
// three reports included.
const WIDE_TABLES = /\/reports\/(waiting|permission-hours|remote-days)$/;
const WORKSPACE_OF: Record<Persona, string[]> = {
  owner: ["/me"], peer: ["/me"], outsider: ["/me"],
  manager: ["/me", "/team"], otherManager: ["/me", "/team"],
  hr: ["/me", "/hr"],
  ceo: ["/me", "/team", "/overview"],
  sysadmin: ["/admin"],
};
const ALL_WORKSPACES = ["/me", "/team", "/hr", "/overview", "/admin"];

async function visibleCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).filter({ visible: true }).count();
}

for (const spec of PAGES) {
  test(`rules on ${spec.id}`, async ({ page }) => {
    await enterAs(page, spec.persona, "fr");
    const path = resolve(spec, fixtures);
    await open(page, path);
    const workspace = `/${path.split("/")[1]}`;

    // M1: one primary action per page.
    expect(await visibleCount(page, "main :is(button, a).bg-primary"), "primary actions").toBeLessThanOrEqual(1);

    // M8: nothing is shown that cannot be used.
    expect(await visibleCount(page, 'main :is(button, input, select, textarea)[disabled], main [aria-disabled="true"]'),
      "disabled controls").toBe(0);

    // M2: at most six navigation entries, all of the current workspace (R1, R2).
    if (ALL_WORKSPACES.includes(workspace)) {
      const entries = await page.locator(`nav a[href="${workspace}"], nav a[href^="${workspace}/"]`).evaluateAll((anchors) =>
        [...new Set(anchors.map((anchor) => anchor.getAttribute("href")))]);
      expect(entries.length, "navigation entries").toBeGreaterThan(0);
      expect(entries.length, "navigation entries").toBeLessThanOrEqual(6);
    }

    // R4: a person is offered their own workspaces and no other.
    for (const other of ALL_WORKSPACES) {
      const offered = (await page.locator(`a[href="${other}"]`).count()) > 0;
      if (!WORKSPACE_OF[spec.persona].includes(other)) {
        expect(offered, `${spec.persona} is offered ${other}`).toBe(false);
      }
    }

    // M3: a home has at most four blocks.
    if (spec.home) {
      expect(await visibleCount(page, "main h2"), "blocks on a home").toBeLessThanOrEqual(4);
    }

    // M4: a list shows at most six attributes per item.
    if (!WIDE_TABLES.test(path)) {
      for (const table of await page.locator("main table").all()) {
        expect(await table.locator("thead th").count(), "columns of a table").toBeLessThanOrEqual(6);
      }
    }

    // U3: no internal code or status name.
    const text = await page.locator("main").innerText();
    const code = CODES.exec(text);
    expect(code?.[0] ?? null, `the page shows the code "${code?.[0]}"`).toBeNull();

    // R2, M8: the Overview workspace offers no editing action at all (UI 8).
    if (workspace === "/overview") {
      const acting = page.locator("main").getByRole("button", { name: /^(Approuver|Refuser|Renvoyer|Modifier|Enregistrer|Supprimer|Créer|Ajouter|Nouveau|Nouvelle)/ });
      expect(await acting.count(), "editing actions in Overview").toBe(0);
    }

    // UI 9: the Administration workspace holds no business data.
    if (workspace === "/admin") {
      expect(text, "business words in Administration").not.toMatch(/\b(Solde|Congé|Télétravail|Certificat)\b/);
    }
  });
}

test("a person with one workspace sees no switcher entry, a person with several sees each", async ({ page }) => {
  await enterAs(page, "owner", "fr");
  await open(page, "/me");
  for (const other of ["/team", "/hr", "/overview", "/admin"]) {
    await expect(page.locator(`a[href="${other}"]`)).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /^Espace/ })).toHaveCount(0);       // no switcher at all

  // The switcher is a menu (plan 01b): its entries are the workspaces of the person, and no other.
  await enterAs(page, "ceo", "fr");
  await open(page, "/overview");
  await page.getByRole("button", { name: /^Espace : Vue d'ensemble/ }).click();
  const entries = await page.getByRole("menuitem").allInnerTexts();
  expect(entries.map((entry) => entry.trim())).toEqual(["Mon espace", "Mon équipe", "Vue d'ensemble"]);
});

test("personal matters stay in My space for HR and executives (R5)", async ({ page }) => {
  for (const persona of ["hr", "ceo"] as const) {
    await enterAs(page, persona, "fr");
    await open(page, "/me/requests");
    await expect(page.getByRole("link", { name: "Nouvelle demande" }).first()).toBeVisible();
    await open(page, "/me/profile");
    await expect(page.locator("h1")).toHaveCount(1);
  }
});
