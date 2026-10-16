import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { Balance } from "./api";
import { BalanceBlock } from "./BalanceBlock";
import { EMPLOYEE_ID, ledgerPage, makeBalance, makeLedgerLine } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve(balance: Balance) {
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => HttpResponse.json(balance)),
    http.get(`/api/v1/balances/${EMPLOYEE_ID}/ledger`, () => HttpResponse.json(ledgerPage([makeLedgerLine()]))),
  );
}

function show(mode: "hr" | "team" | "overview") {
  renderApp(<BalanceBlock employeeId={EMPLOYEE_ID} mode={mode} />, { route: "/", me });
  return userEvent.setup();
}

describe("BalanceBlock", () => {
  it("lets HR adjust, and record the opening balance while there is none", async () => {
    serve(makeBalance({ has_opening: false, can_enter_opening: true }));
    const user = show("hr");

    expect(await screen.findByRole("button", { name: "Ajuster" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saisir le solde d'ouverture" }));

    expect(await screen.findByRole("dialog", { name: "Solde d'ouverture : Amel Trabelsi" })).toBeInTheDocument();
  });

  it("offers only the adjustment once the opening balance exists", async () => {
    serve(makeBalance({ has_opening: true }));
    const user = show("hr");

    await user.click(await screen.findByRole("button", { name: "Ajuster" }));

    expect(await screen.findByRole("dialog", { name: "Ajuster le solde : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saisir le solde d'ouverture" })).not.toBeInTheDocument();
  });

  it("offers no opening balance to someone hired once monthly credits had started, only the adjustment", async () => {
    serve(makeBalance({ has_opening: false, can_enter_opening: false }));
    show("hr");

    expect(await screen.findByRole("button", { name: "Ajuster" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saisir le solde d'ouverture" })).not.toBeInTheDocument();
  });

  it("closes the sheet when it asks to", async () => {
    serve(makeBalance());
    const user = show("hr");

    await user.click(await screen.findByRole("button", { name: "Ajuster" }));
    await user.click(await screen.findByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["team", "overview"] as const)("shows the figures and the history without any action in %s mode", async (mode) => {
    serve(makeBalance({ has_opening: false, can_enter_opening: true }));
    show(mode);

    expect(await screen.findByRole("region", { name: "Solde de congés annuels" })).toHaveTextContent(/12,5\s*jours/);
    expect((await screen.findAllByText("Crédit mensuel")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ajuster" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saisir le solde d'ouverture" })).not.toBeInTheDocument();
  });

  it("keeps the sheet and what was typed while the application is away", async () => {
    serve(makeBalance());
    const { queryClient } = renderApp(
      <ProblemBoundary>
        <BalanceBlock employeeId={EMPLOYEE_ID} mode="hr" />
      </ProblemBoundary>,
      { route: "/", me },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ajuster" }));
    await user.type(await screen.findByLabelText(/Motif/), "Deux demi-journées comptées deux fois");

    // A later reading of the figures and of the history (a return to the window) is not answered.
    const away = () => new HttpResponse("<html>Service unavailable</html>", { status: 503 });
    server.use(
      http.get(`/api/v1/balances/${EMPLOYEE_ID}`, away),
      http.get(`/api/v1/balances/${EMPLOYEE_ID}/ledger`, away),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["balances"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(["balances", EMPLOYEE_ID, "figures"])?.status).toBe("error");
    expect(screen.getByRole("dialog", { name: "Ajuster le solde : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Motif/)).toHaveValue("Deux demi-journées comptées deux fois");
  });
});
