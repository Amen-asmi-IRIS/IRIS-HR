import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { OverviewHome } from "./api";
import OverviewHomePage from "./OverviewHomePage";

const full: OverviewHome = {
  out_now: [
    { department: "Souscription",
      today: [{ name: "Sana Trabelsi", label: "absent", start_date: "2026-11-02", end_date: "2026-11-03", waiting: false }],
      week: [{ name: "Sana Trabelsi", label: "absent", start_date: "2026-11-02", end_date: "2026-11-03", waiting: false }] },
    { department: "Sinistres", today: [],
      week: [{ name: "Karim Gharbi", label: "remote", start_date: "2026-11-05", end_date: "2026-11-05", waiting: false }] },
  ],
  absence_this_month: [
    { department: "Souscription", days: "2.00", previous_days: "1.50" },
    { department: "Sinistres", days: "0.50", previous_days: "0.00" },
  ],
  leave_owed: {
    departments: [{ department: "Souscription", total: "25.00" }, { department: "Sinistres", total: "12.00" }],
    largest: [{ name: "Amine Jaziri", department: "Souscription", balance: "20.00" },
              { name: "Karim Gharbi", department: "Sinistres", balance: "12.00" }],
  },
  waiting: [{ request_public_id: "r7", employee_name: "Amine Jaziri", type_name: "Congé annuel",
              waiting_on: ["Sami Ben Ali"], since: "2026-10-28T09:12:00+01:00" }],
};

const quiet: OverviewHome = {
  out_now: [],
  absence_this_month: [{ department: "Souscription", days: "0.00", previous_days: "0.00" }],
  leave_owed: { departments: [{ department: "Souscription", total: "0.00" }], largest: [] },
  waiting: [],
};

function show(data: OverviewHome) {
  server.use(http.get("/api/v1/home/overview", () => HttpResponse.json(data)));
  renderApp(<OverviewHomePage />, { route: "/overview", path: "/overview", me: makeMe({ roles: ["employee", "exec"] }) });
}

const block = (name: string) => screen.findByRole("region", { name });
const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("OverviewHomePage", () => {
  it("has four blocks and no action at all", async () => {
    show(full);

    await block("Absents en ce moment");
    expect(blockTitles()).toEqual(["Absents en ce moment", "Absences ce mois-ci", "Congés acquis", "En attente"]);
    expect(screen.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nouvelle demande/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();          // no chart
  });

  it("says who is out today and who will be before Sunday, by department, with labels only", async () => {
    show(full);

    const out = await block("Absents en ce moment");
    expect(within(out).getByText("1 personne absente ou en télétravail aujourd'hui")).toBeInTheDocument();
    const [underwriting, claims] = within(out).getAllByRole("group");
    expect(underwriting).toHaveAccessibleName("Souscription");
    expect(underwriting).toHaveTextContent("Aujourd'hui : Sana Trabelsi · Absent(e)");
    expect(underwriting).not.toHaveTextContent("D'ici dimanche");            // nobody else later this week
    expect(claims).toHaveAccessibleName("Sinistres");
    expect(claims).toHaveTextContent("D'ici dimanche : Karim Gharbi · Télétravail, 5 nov. 2026");
    expect(claims).not.toHaveTextContent("Aujourd'hui");
  });

  it("lists a sick leave that waits for HR as out, with its label and the word pending only", async () => {
    const waiting = { name: "Sana Trabelsi", label: "absent" as const, start_date: "2026-11-02", end_date: "2026-11-02", waiting: true };
    show({ ...quiet, out_now: [{ department: "Souscription", today: [waiting], week: [waiting] }] });

    const out = await block("Absents en ce moment");
    expect(within(out).getByText("1 personne absente ou en télétravail aujourd'hui")).toBeInTheDocument();
    expect(within(out).getByRole("group")).toHaveTextContent("Aujourd'hui : Sana Trabelsi · Absent(e) · en attente");
  });

  it("gives the days of absence per department for this month and the last", async () => {
    show(full);

    const table = within(await block("Absences ce mois-ci")).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Département", "Ce mois-ci", "Mois précédent"]);
    const [, underwriting, claims] = within(table).getAllByRole("row");
    expect(within(underwriting).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2 jours", "1,5 jour"]);
    expect(within(underwriting).getByRole("rowheader")).toHaveTextContent("Souscription");
    expect(within(claims).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["0,5 jour", "0 jour"]);
  });

  it("totals the leave owed per department and names the largest balances", async () => {
    show(full);

    const owed = await block("Congés acquis");
    expect(owed).toHaveTextContent("Souscription25 jours");
    expect(owed).toHaveTextContent("Sinistres12 jours");
    const largest = within(owed).getByRole("list", { name: "Soldes les plus élevés" });
    expect(within(largest).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Amine Jaziri, Souscription20 jours", "Karim Gharbi, Sinistres12 jours",
    ]);
  });

  it("lists what has waited longest, each line opening its request", async () => {
    show(full);

    const waiting = await block("En attente");
    const link = within(waiting).getByRole("link", { name: /Amine Jaziri/ });
    expect(link).toHaveAttribute("href", "/requests/r7");
    expect(link).toHaveTextContent("Amine Jaziri, Congé annuel");
    expect(waiting).toHaveTextContent("en attente de Sami Ben Ali");
    expect(waiting).toHaveTextContent("depuis le 28 oct. 2026 à 09:12");
  });

  it("shrinks every empty block to one line", async () => {
    show(quiet);

    expect(within(await block("Absents en ce moment")).getByText("Tout le monde est présent cette semaine.")).toBeInTheDocument();
    expect(within(await block("Congés acquis")).getByText("Aucun solde positif.")).toBeInTheDocument();
    expect(within(await block("En attente")).getByText("Aucune demande n'attend de décision.")).toBeInTheDocument();
    expect(blockTitles()).toHaveLength(4);
  });
});
