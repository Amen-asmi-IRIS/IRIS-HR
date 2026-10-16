import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import ProfileChangesPage from "./ProfileChangesPage";
import { makeProfileChange } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const DECIDE = "/api/v1/profile-changes/chg-1/decide";

function mount(route = "/hr/profile-changes") {
  return renderApp(<ProfileChangesPage />, { route, me: hr });
}

function listReturns(pending: unknown[], decided: unknown[] = []) {
  const seen: string[] = [];
  server.use(
    http.get("/api/v1/profile-changes", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push(`${params.get("scope")}:${params.get("status")}`);
      return HttpResponse.json(pageOf(params.get("status") === "decided" ? decided : pending));
    }),
  );
  return seen;
}

async function openProposal() {
  await userEvent.click(await screen.findByRole("button", { name: "Ouvrir la proposition de Amal Employee" }));
}

describe("ProfileChangesPage", () => {
  it("lists what waits for HR and shows current against proposed values", async () => {
    const seen = listReturns([makeProfileChange()]);

    mount();
    await openProposal();

    expect(seen[0]).toBe("all:pending");
    expect(await screen.findByText("Proposition de Amal Employee")).toBeInTheDocument();
    expect(screen.getAllByText("Genre, Téléphone").length).toBeGreaterThan(0);
    expect(screen.getByRole("row", { name: "Genre (vide) Femme" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Téléphone (vide) 20 111 222" })).toBeInTheDocument();
    expect(screen.getByText("Message de l'employé : Nouveau numéro")).toBeInTheDocument();
  });

  it("accepts with a comment", async () => {
    listReturns([makeProfileChange()]);
    let body: unknown;
    server.use(
      http.post(DECIDE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange({ status: "accepted" }));
      }),
    );
    mount();
    await openProposal();

    await userEvent.type(await screen.findByLabelText("Commentaire (facultatif)"), "Merci");
    await userEvent.click(screen.getByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(body).toEqual({ accept: true, comment: "Merci" }));
    await waitFor(() => expect(screen.queryByText("Proposition de Amal Employee")).not.toBeInTheDocument());
  });

  it("refuses", async () => {
    listReturns([makeProfileChange()]);
    let body: unknown;
    server.use(
      http.post(DECIDE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange({ status: "rejected" }));
      }),
    );
    mount();
    await openProposal();

    await userEvent.click(await screen.findByRole("button", { name: "Refuser" }));

    await waitFor(() => expect(body).toEqual({ accept: false, comment: "" }));
  });

  it("closes and refreshes when someone else decided first", async () => {
    const seen = listReturns([makeProfileChange()]);
    server.use(
      http.post(DECIDE, () =>
        problem(409, "organisation.change_already_decided", [
          {
            field: null,
            code: "organisation.change_already_decided",
            detail: "Cette proposition a déjà été traitée ou retirée.",
          },
        ]),
      ),
    );
    mount();
    await openProposal();
    const before = seen.length;

    await userEvent.click(await screen.findByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(screen.queryByText("Proposition de Amal Employee")).not.toBeInTheDocument());
    await waitFor(() => expect(seen.length).toBeGreaterThan(before));
  });

  it("shows decided proposals with their outcome and no decision to make", async () => {
    const decided = makeProfileChange({
      status: "rejected",
      decided_by: "Senna RH",
      decided_at: "2026-10-21T11:00:00+01:00",
      comment: "Justificatif manquant",
    });
    listReturns([], [decided]);

    mount("/hr/profile-changes?view=decided");
    await openProposal();

    expect(screen.getAllByText("Refusée").length).toBeGreaterThan(0);
    expect(await screen.findByText(/^Refusée par Senna RH le /)).toBeInTheDocument();
    expect(screen.getByText("Commentaire : Justificatif manquant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument();
  });

  it("says when nothing waits", async () => {
    listReturns([]);

    mount();

    expect(await screen.findByText("Aucune modification à traiter.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Traitées" }));
    expect(await screen.findByText("Aucune modification traitée.")).toBeInTheDocument();
  });
});
