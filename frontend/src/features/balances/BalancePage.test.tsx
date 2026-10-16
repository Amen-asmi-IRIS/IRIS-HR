import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { Balance, LedgerLine } from "./api";
import BalancePage from "./BalancePage";
import { EMPLOYEE_ID, ledgerPage, makeBalance, makeLedgerLine } from "./testing";

const me = {
  ...makeMe({ roles: ["employee"], workspaces: ["me"] }),
  employee: { public_id: EMPLOYEE_ID, name: "Amel Trabelsi" },
};

const LINES: LedgerLine[] = [
  makeLedgerLine({ id: 3, kind: "adjustment", amount: "-1.00", effective_date: "2026-10-02", period: "", reason: "Un jour compté deux fois", created_by: "Sana Gharbi", balance_after: "12.50" }),
  makeLedgerLine({ id: 2, kind: "credit", amount: "2.50", effective_date: "2026-09-30", period: "2026-09", balance_after: "13.50" }),
  makeLedgerLine({ id: 1, kind: "taken", amount: "-2.00", effective_date: "2026-09-14", period: "", request_public_id: "req-1", balance_after: "11.00" }),
];

const TOO_FAR = {
  type: "urn:iris-hr:problem:balances.date_out_of_range",
  title: "Bad Request",
  status: 400,
  code: "balances.date_out_of_range",
  detail: "Choisissez une date dans les deux prochaines années.",
  errors: [
    { field: "on", code: "balances.date_out_of_range", detail: "Choisissez une date dans les deux prochaines années.", params: {} },
  ],
  request_id: "r-1",
};

function serve(balance: Balance = makeBalance(), lines: LedgerLine[] = LINES) {
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, ({ request }) => {
      const on = new URL(request.url).searchParams.get("on");
      if (on === "9999-12-31") {
        return HttpResponse.json(TOO_FAR, { status: 400, headers: { "Content-Type": "application/problem+json" } });
      }
      const asOf = on ? { date: on, balance: "17.50", projected: on > "2026-10-05" } : null;
      return HttpResponse.json({ ...balance, as_of: asOf });
    }),
    http.get(`/api/v1/balances/${EMPLOYEE_ID}/ledger`, () => HttpResponse.json(ledgerPage(lines))),
  );
}

function show() {
  renderApp(<BalancePage />, { route: "/me/balance", me });
  return userEvent.setup();
}

describe("My space, Balance", () => {
  it("shows the balance first and keeps the history one step away", async () => {
    serve();
    show();

    const summary = await screen.findByRole("region", { name: "Solde de congés annuels" });
    expect(within(summary).getByText(/12,5\s*jours/)).toBeInTheDocument();
    expect(within(summary).getByText("En attente de décision")).toBeInTheDocument();
    expect(within(summary).getByText("Approuvés à venir")).toBeInTheDocument();
    expect(within(summary).getByText("Prochain crédit mensuel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Solde" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historique" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Solde à une date" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Ajuster" })).not.toBeInTheDocument();
  });

  it("opens the history entry by entry, with the balance after each line and what is behind it", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Historique" }));

    // getAll: the shared table may render each line twice, as a row and as a phone card
    expect((await screen.findAllByText("Ajustement RH")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crédit mensuel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Congé pris").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2,5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^[-−]2$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13,5\s*jours/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Un jour compté deux fois").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Voir la demande" })[0]).toHaveAttribute("href", "/requests/req-1");
  });

  it("gives the expected balance on a future date and says it is a projection", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-31" } });

    expect(await screen.findByText(/Solde prévu au .+ : 17,5\s*jours/)).toBeInTheDocument();
    expect(screen.getByText(/Tient compte des crédits mensuels à venir/)).toBeInTheDocument();
  });

  it("gives the posted balance on a past date", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-31" } });

    expect(await screen.findByText(/Solde au .+ : 17,5\s*jours/)).toBeInTheDocument();
    expect(screen.queryByText(/Tient compte des crédits mensuels à venir/)).not.toBeInTheDocument();
  });

  it("shows the server's message next to the date when it is too far ahead", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "9999-12-31" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Choisissez une date dans les deux prochaines années.");
    expect(screen.getByLabelText("Date")).toHaveValue("9999-12-31");
  });

  it("shows a zero balance and an empty history for a new employee", async () => {
    serve(
      makeBalance({ current: "0.00", pending: "0.00", approved_upcoming: "0.00", next_credit_amount: null, next_credit_date: null, has_opening: false }),
      [],
    );
    const user = show();

    const summary = await screen.findByRole("region", { name: "Solde de congés annuels" });
    expect(summary).toHaveTextContent(/0\s*jours?/);
    expect(within(summary).queryByText("Prochain crédit mensuel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historique" }));
    expect((await screen.findAllByText("Aucune écriture pour l'instant.")).length).toBeGreaterThan(0);
  });
});
