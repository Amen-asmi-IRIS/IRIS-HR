import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { AdjustBalanceSheet } from "./AdjustBalanceSheet";
import type { AdjustmentKind, Balance } from "./api";
import { EMPLOYEE_ID, makeBalance, makeLedgerLine } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function problem(status: number, code: string, field: string | null, detail: string) {
  return HttpResponse.json(
    {
      type: `urn:iris-hr:problem:${code}`,
      title: "Refused",
      status,
      code,
      detail,
      errors: [{ field, code, detail, params: {} }],
      request_id: "r-1",
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function setup({
  kind = "adjustment",
  balance = makeBalance(),
  refuse,
}: { kind?: AdjustmentKind; balance?: Balance; refuse?: () => Response } = {}) {
  const posted: Record<string, unknown>[] = [];
  let reads = 0;
  const onOpenChange = vi.fn();
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => {
      reads += 1;
      return HttpResponse.json(balance);
    }),
    http.post(`/api/v1/balances/${EMPLOYEE_ID}/adjustments`, async ({ request }) => {
      posted.push((await request.json()) as Record<string, unknown>);
      return refuse ? refuse() : HttpResponse.json(makeLedgerLine({ kind }), { status: 201 });
    }),
  );
  renderApp(<AdjustBalanceSheet employeeId={EMPLOYEE_ID} kind={kind} open onOpenChange={onOpenChange} />, {
    route: "/",
    me,
  });
  return { user: userEvent.setup(), posted, onOpenChange, reads: () => reads };
}

const days = () => screen.getByLabelText(/Nombre de jours/);
const reason = () => screen.getByLabelText(/Motif/);
const save = () => screen.getByRole("button", { name: "Enregistrer" });

describe("AdjustBalanceSheet", () => {
  it("shows the current balance and the balance after as the days are typed", async () => {
    const { user } = setup();

    expect(await screen.findByRole("dialog", { name: "Ajuster le solde : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.getByText(/Solde actuel : 12,5\s*jours/)).toBeInTheDocument();

    await user.type(days(), "1,5");

    expect(screen.getByText(/Solde après : 14\s*jours/)).toBeInTheDocument();
  });

  it("accepts a comma as the decimal separator", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1,5");
    await user.type(reason(), "Deux demi-journées comptées deux fois");
    await user.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posted).toEqual([
      {
        kind: "adjustment",
        amount: "1.5",
        effective_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        reason: "Deux demi-journées comptées deux fois",
      },
    ]);
  });

  it("removes days when asked to", async () => {
    const { user, posted } = setup();
    await screen.findByText(/Solde actuel/);

    await user.click(screen.getByRole("radio", { name: "Retirer des jours" }));
    await user.type(days(), "2");
    expect(screen.getByText(/Solde après : 10,5\s*jours/)).toBeInTheDocument();
    await user.type(reason(), "Congé de septembre jamais saisi");
    await user.click(save());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].amount).toBe("-2");
  });

  it("shows a negative resulting balance", async () => {
    const { user } = setup({ balance: makeBalance({ current: "1.00" }) });
    await screen.findByText(/Solde actuel/);

    await user.click(screen.getByRole("radio", { name: "Retirer des jours" }));
    await user.type(days(), "3");

    expect(screen.getByText(/Solde après : [-−]2\s*jours/)).toBeInTheDocument();
  });

  it("does not send without a reason", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1");
    await user.click(save());
    expect(await screen.findByText("Indiquez le motif. Il est conservé dans l'historique.")).toBeInTheDocument();

    await user.type(reason(), "   ");
    await user.click(save());

    expect(await screen.findByText("Indiquez le motif. Il est conservé dans l'historique.")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(days()).toHaveValue("1");
  });

  it("does not send an adjustment of zero or of text", async () => {
    const { user, posted } = setup();
    await screen.findByText(/Solde actuel/);
    await user.type(reason(), "Correction");

    await user.type(days(), "0");
    await user.click(save());
    expect(await screen.findByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();

    await user.clear(days());
    await user.type(days(), "deux");
    await user.click(save());
    expect(await screen.findByText("Saisissez un nombre de jours, par exemple 1,5.")).toBeInTheDocument();

    expect(posted).toHaveLength(0);
  });

  it("sends once when Save is clicked twice", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1");
    await user.type(reason(), "Correction");
    await user.dblClick(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posted).toHaveLength(1);
  });

  it("puts a server refusal next to its field and keeps what was typed", async () => {
    const { user, onOpenChange } = setup({
      refuse: () => problem(400, "max_decimal_places", "amount", "Pas plus de deux décimales."),
    });
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1.234");
    await user.type(reason(), "Correction");
    await user.click(save());

    expect(await screen.findByText("Pas plus de deux décimales.")).toBeInTheDocument();
    expect(days()).toHaveValue("1.234");
    expect(reason()).toHaveValue("Correction");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("records an opening balance, zero included", async () => {
    const { user, posted } = setup({ kind: "opening", balance: makeBalance({ has_opening: false }) });

    expect(await screen.findByRole("dialog", { name: "Solde d'ouverture : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Solde d'ouverture \(jours\)/), "0");
    await user.type(reason(), "Aucun reliquat en 2025");
    await user.click(save());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ kind: "opening", amount: "0", reason: "Aucun reliquat en 2025" });
  });

  it("proposes the day before monthly credits start as the date of an opening balance", async () => {
    const { user, posted } = setup({ kind: "opening", balance: makeBalance({ has_opening: false, opening_date: "2026-06-30" }) });
    await screen.findByText(/Solde actuel/);

    expect(screen.getByLabelText(/Date d'effet/)).toHaveValue("2026-06-30");
    expect(screen.queryByText(/pas encore fixé/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Solde d'ouverture \(jours\)/), "12");
    await user.type(reason(), "Reliquat 2025");
    await user.click(save());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ kind: "opening", effective_date: "2026-06-30" });
  });

  it("proposes today for an opening balance, and says why, while monthly credits have no start date", async () => {
    setup({ kind: "opening", balance: makeBalance({ has_opening: false, opening_date: null }) });
    await screen.findByText(/Solde actuel/);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
    expect(screen.getByLabelText(/Date d'effet/)).toHaveValue(today);
    expect(
      screen.getByText("Le début des crédits mensuels n'est pas encore fixé : la date proposée est celle d'aujourd'hui."),
    ).toBeInTheDocument();
  });

  it("proposes today for an adjustment, whatever the start of monthly credits", async () => {
    setup({ balance: makeBalance({ opening_date: "2026-06-30" }) });
    await screen.findByText(/Solde actuel/);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
    expect(screen.getByLabelText(/Date d'effet/)).toHaveValue(today);
  });

  it("says when the opening balance already exists", async () => {
    const message = "Cet employé a déjà un solde d'ouverture. Passez un ajustement pour le corriger.";
    const { user, onOpenChange } = setup({
      kind: "opening",
      refuse: () => problem(409, "balances.opening_exists", null, message),
    });
    await screen.findByText(/Solde actuel/);

    await user.type(screen.getByLabelText(/Solde d'ouverture \(jours\)/), "12");
    await user.type(reason(), "Reliquat 2025");
    await user.click(save());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("refreshes the balance after saving", async () => {
    const { user, reads, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);
    const before = reads();

    await user.type(days(), "1");
    await user.type(reason(), "Correction");
    await user.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });
});
