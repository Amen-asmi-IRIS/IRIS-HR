import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { BalanceSummary } from "./BalanceSummary";
import { makeBalance } from "./testing";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

describe("BalanceSummary", () => {
  it("shows the balance first, then what is held, what is upcoming and the next credit", () => {
    renderApp(<BalanceSummary balance={makeBalance()} />, { route: "/", me });

    const summary = screen.getByRole("region", { name: "Solde de congés annuels" });
    expect(within(summary).getByText(/12,5\s*jours/)).toBeInTheDocument();
    expect(within(summary).getByText("En attente de décision").nextElementSibling).toHaveTextContent(/3\s*jours/);
    expect(within(summary).getByText("Approuvés à venir").nextElementSibling).toHaveTextContent(/2\s*jours/);
    expect(within(summary).getByText("Prochain crédit mensuel").nextElementSibling).toHaveTextContent(
      /2,5\s*jours.*31.*2026/,
    );
  });

  it("leaves the next credit out when none is planned", () => {
    renderApp(
      <BalanceSummary balance={makeBalance({ next_credit_amount: null, next_credit_date: null })} />,
      { route: "/", me },
    );

    expect(screen.queryByText("Prochain crédit mensuel")).not.toBeInTheDocument();
  });

  it("shows a negative balance as it is", () => {
    renderApp(<BalanceSummary balance={makeBalance({ current: "-2.00" })} />, { route: "/", me });

    expect(screen.getByRole("region", { name: "Solde de congés annuels" })).toHaveTextContent(/[-−]2\s*jours/);
  });
});
