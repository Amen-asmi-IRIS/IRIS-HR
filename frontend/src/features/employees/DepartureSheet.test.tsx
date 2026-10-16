import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDaysISO, todayISO } from "@/lib/dates";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { DepartureSheet } from "./DepartureSheet";
import { makeEmployee, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const leaver = makeEmployee({ public_id: "emp-3", name: "Mounir Manager" });
const PREVIEW = "/api/v1/employees/emp-3/archive-preview";
const ARCHIVE = "/api/v1/employees/emp-3/archive";

function mount(onOpenChange = vi.fn()) {
  renderApp(<DepartureSheet employee={leaver} open onOpenChange={onOpenChange} />, { route: "/hr/employees/emp-3", me: hr });
  return onOpenChange;
}

describe("DepartureSheet", () => {
  beforeEach(() => {
    server.use(http.get(PREVIEW, () => HttpResponse.json({ has_account: false, reports: [], sections: [] })));
  });

  it("lists the consequences before anything is confirmed", async () => {
    server.use(
      http.get(PREVIEW, () =>
        HttpResponse.json({
          has_account: true,
          reports: [{ label: "Amal Employee", link: "/hr/employees/emp-4" }],
          sections: [
            { key: "open_requests", items: [{ label: "Congé annuel, 03/11/2026", link: "/requests/req-1" }] },
          ],
        }),
      ),
    );

    mount();

    expect(await screen.findByText("Enregistrer le départ de Mounir Manager")).toBeInTheDocument();
    expect(await screen.findByText(/Son compte sera désactivé immédiatement/)).toBeInTheDocument();
    expect(screen.getByText(/Plus aucun crédit mensuel de congés/)).toBeInTheDocument();
    expect(screen.getByText(/auront besoin d'un nouveau responsable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amal Employee" })).toHaveAttribute("href", "/hr/employees/emp-4");
    expect(screen.getByText("Ces demandes resteront ouvertes :")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Congé annuel, 03/11/2026" })).toHaveAttribute("href", "/requests/req-1");
  });

  it("does not mention an account or a team that do not exist", async () => {
    mount();

    expect(await screen.findByText(/Plus aucun crédit mensuel de congés/)).toBeInTheDocument();
    expect(screen.queryByText(/Son compte sera désactivé/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auront besoin d'un nouveau responsable/)).not.toBeInTheDocument();
  });

  it("tells HR to adjust the balance when the leaving date is in a month already over", async () => {
    mount();
    const firstOfThisMonth = `${todayISO().slice(0, 8)}01`;
    await screen.findByText(/Plus aucun crédit mensuel de congés/);

    fireEvent.change(screen.getByLabelText("Date de départ"), { target: { value: firstOfThisMonth } });
    expect(screen.queryByText(/ne sont pas repris/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date de départ"), { target: { value: addDaysISO(firstOfThisMonth, -1) } });
    expect(
      await screen.findByText(
        "La date de départ tombe dans un mois déjà terminé : les crédits mensuels de congés déjà versés pour ce mois et les suivants ne sont pas repris. Vérifiez l'historique de son solde et ajustez-le si besoin.",
      ),
    ).toBeInTheDocument();
  });

  it("needs a date and a reason", async () => {
    let posted = false;
    server.use(
      http.post(ARCHIVE, () => {
        posted = true;
        return HttpResponse.json(makeEmployee({ status: "archived" }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Enregistrer le départ" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(posted).toBe(false);
  });

  it("records the departure and closes", async () => {
    let body: unknown;
    server.use(
      http.post(ARCHIVE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeEmployee({ status: "archived", archived_at: "2026-11-30" }));
      }),
    );
    const onOpenChange = mount();

    fireEvent.change(await screen.findByLabelText("Date de départ"), { target: { value: "2026-11-30" } });
    await userEvent.type(screen.getByLabelText("Motif"), "Démission");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le départ" }));

    await waitFor(() => expect(body).toEqual({ leaving_date: "2026-11-30", reason: "Démission" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await screen.findByText("Départ enregistré.")).toBeInTheDocument();
  });

  it("closes when someone else already recorded it", async () => {
    server.use(
      http.post(ARCHIVE, () =>
        problem(409, "organisation.already_archived", [
          { field: null, code: "organisation.already_archived", detail: "Ce départ a déjà été enregistré." },
        ]),
      ),
    );
    const onOpenChange = mount();

    fireEvent.change(await screen.findByLabelText("Date de départ"), { target: { value: "2026-11-30" } });
    await userEvent.type(screen.getByLabelText("Motif"), "Démission");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le départ" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
