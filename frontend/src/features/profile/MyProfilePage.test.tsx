import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeDocument, makeEmployee, pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import MyProfilePage from "./MyProfilePage";
import { makeProfileChange } from "./testing";

const employee = makeMe({
  roles: ["employee"],
  name: "Amal Employee",
  email: "employee.a1@impactrisks.com",
  employee: { public_id: "emp-1", name: "Amal Employee" },
});

function mount(me = employee) {
  return renderApp(
    <ProblemBoundary>
      <MyProfilePage />
    </ProblemBoundary>,
    { route: "/me/profile", path: "/me/profile", me },
  );
}

/** Answers the list of proposals by the status that is asked for. */
function proposals(byStatus: { pending?: unknown[]; decided?: unknown[] }) {
  return http.get("/api/v1/profile-changes", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") as "pending" | "decided";
    return HttpResponse.json(pageOf(byStatus[status] ?? []));
  });
}

describe("MyProfilePage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/me", () =>
        HttpResponse.json(
          makeEmployee({ address: "5 rue de Marseille, Tunis", emergency_contact_name: "Sami Employee" }),
        ),
      ),
      proposals({}),
    );
  });

  it("shows my own details and offers to propose a change", async () => {
    mount();

    expect(await screen.findByRole("heading", { level: 1, name: "Mon profil" })).toBeInTheDocument();
    for (const section of ["Identité", "Coordonnées", "Personne à prévenir", "Rattachement"]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    }
    for (const text of [
      "Amal",
      "Femme",
      "employee.a1@impactrisks.com",
      "5 rue de Marseille, Tunis",
      "Sami Employee",
      "Souscription",
      "Chargé de clientèle",
      "Mounir Manager",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Proposer une modification" })).toHaveAttribute(
      "href",
      "/me/profile/change",
    );
    expect(screen.queryByText("Votre modification attend la décision des RH")).not.toBeInTheDocument();
    // Nothing on this page changes the record directly.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the waiting proposal in place of the action and lets me withdraw it", async () => {
    let withdrawn = false;
    server.use(
      http.get("/api/v1/profile-changes", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(pageOf(status === "pending" && !withdrawn ? [makeProfileChange()] : []));
      }),
      http.post("/api/v1/profile-changes/chg-1/withdraw", () => {
        withdrawn = true;
        return HttpResponse.json(makeProfileChange({ status: "withdrawn" }));
      }),
    );
    mount();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Votre modification attend la décision des RH" }),
    ).toBeInTheDocument();
    expect(screen.getByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Genre : (vide) → Femme")).toBeInTheDocument();
    expect(screen.getByText("Téléphone : (vide) → 20 111 222")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Proposer une modification" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retirer la proposition" }));

    expect(await screen.findByText("Proposition retirée.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Proposer une modification" })).toBeInTheDocument();
    expect(screen.queryByText("Votre modification attend la décision des RH")).not.toBeInTheDocument();
  });

  it("keeps the shared documents, the past proposals and the previous sign-in one step away", async () => {
    server.use(
      proposals({
        decided: [
          makeProfileChange({
            public_id: "chg-0",
            status: "rejected",
            changes: [{ field: "address", old: "", new: "3 rue d'Alger" }],
            decided_by: "Senna RH",
            decided_at: "2026-09-12T11:00:00+01:00",
            comment: "Merci de joindre un justificatif.",
          }),
        ],
      }),
      http.get("/api/v1/employees/emp-1/documents", () =>
        HttpResponse.json([makeDocument({ visible_to_employee: true })]),
      ),
    );
    mount();
    await screen.findByRole("heading", { level: 1, name: "Mon profil" });
    expect(screen.queryByText("Refusée")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Documents partagés par les RH" }));
    expect(await screen.findByRole("link", { name: "Télécharger Contrat" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Partagé avec l'employé")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mes propositions passées" }));
    expect(await screen.findByText("Refusée")).toBeInTheDocument();
    expect(screen.getByText("Adresse : (vide) → 3 rue d'Alger")).toBeInTheDocument();
    expect(screen.getByText("Commentaire des RH : Merci de joindre un justificatif.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Connexion précédente" }));
    expect(screen.getByText(/^Votre connexion précédente date du /)).toBeInTheDocument();
  });

  it("says so when this is the first sign-in", async () => {
    mount(makeMe({ ...employee, previous_login_at: null }));

    await userEvent.click(await screen.findByRole("button", { name: "Connexion précédente" }));

    expect(screen.getByText("C'est votre première connexion.")).toBeInTheDocument();
  });

  it("says not available to an account without an employee record", async () => {
    server.use(http.get("/api/v1/employees/me", () => problem(404, "core.not_found", [])));

    mount();

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
