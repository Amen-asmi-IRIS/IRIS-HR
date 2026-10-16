import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import ReportsIndexPage from "./ReportsIndexPage";

const REPORTS = [
  "Absences prises",
  "Soldes à une date",
  "Demandes en attente",
  "Heures de permission par mois",
  "Jours de télétravail par mois",
];

describe("ReportsIndexPage", () => {
  it("gives the HR desk six reports, the activity log and the KPMG export as primary action", () => {
    renderApp(<ReportsIndexPage workspace="hr" />, { route: "/hr/reports", me: makeMe({ roles: ["employee", "hr"] }) });

    for (const name of [...REPORTS, "Certificats en attente"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /^Absences prises/ })).toHaveAttribute("href", "/hr/reports/absences");
    expect(screen.getByRole("link", { name: "Export KPMG" })).toHaveAttribute("href", "/hr/reports/kpmg");
    expect(screen.getByRole("link", { name: /^Journal d'activité/ })).toHaveAttribute("href", "/hr/reports/activity");
  });

  it("gives My team five reports about the team and nothing else", () => {
    renderApp(<ReportsIndexPage workspace="team" />, {
      route: "/team/reports",
      me: makeMe({ roles: ["employee", "manager"] }),
    });

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText("Ces rapports portent sur votre équipe.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Certificats/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export KPMG" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Soldes à une date/ })).toHaveAttribute("href", "/team/reports/balances");
  });

  it("gives Overview the reports without the KPMG export", () => {
    renderApp(<ReportsIndexPage workspace="overview" />, {
      route: "/overview/reports",
      me: makeMe({ roles: ["employee", "exec"] }),
    });

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "Export KPMG" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Journal d'activité/ })).not.toBeInTheDocument();
  });
});
