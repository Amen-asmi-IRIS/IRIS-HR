import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeDelegation } from "@/features/delegations/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeeRecordPage from "./EmployeeRecordPage";
import type { RecordMode } from "./recordBlocks";
import { makeDocument, makeEmployee, makeEmployeeRow, makeTeamMember, pageOf, problem } from "./testing";

const viewers = {
  hr: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
  overview: makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] }),
  team: makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] }),
};
const paths = { hr: "/hr/employees", overview: "/overview/people", team: "/team/people" };

function mount(mode: RecordMode, id = "emp-1") {
  return renderApp(
    <ProblemBoundary>
      <EmployeeRecordPage mode={mode} />
    </ProblemBoundary>,
    { route: `${paths[mode]}/${id}`, path: `${paths[mode]}/:id`, me: viewers[mode] },
  );
}

async function open(block: string) {
  await userEvent.click(await screen.findByRole("button", { name: block }));
}

describe("EmployeeRecordPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.get("/api/v1/employees", () =>
        HttpResponse.json(pageOf([makeEmployeeRow({ public_id: "emp-5", name: "Bilel Employee" })])),
      ),
      http.get("/api/v1/employees/me", () => HttpResponse.json(makeEmployee({ public_id: "emp-2" }))),
      http.get("/api/v1/employees/directory", () => HttpResponse.json([])),
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(pageOf([makeDelegation({ manager: { public_id: "emp-1", name: "Amal Employee" } })])),
      ),
      http.get("/api/v1/employees/emp-1/documents", () => HttpResponse.json([makeDocument()])),
      http.get("/api/v1/employees/emp-1/history", () =>
        HttpResponse.json(
          pageOf([
            {
              id: 7,
              at: "2026-10-12T10:15:00+01:00",
              actor: "Senna RH",
              category: "business",
              action: "employee.updated",
              object_type: "employee",
              object_id: "emp-1",
              object_label: "Amal Employee",
              changes: { phone: { before: "", after: "71 000 000" }, status: { before: "active", after: "suspended" } },
              ip_address: "10.0.0.5",
              request_id: "r-1",
            },
          ]),
        ),
      ),
    );
  });

  it("opens on the facts and keeps the rest one step away", async () => {
    mount("hr");

    expect(await screen.findByRole("heading", { name: "Amal Employee" })).toBeInTheDocument();
    for (const text of ["E004", "Souscription", "Chargé de clientèle", "Mounir Manager", "En poste", "Compte créé"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/^CDI, depuis le /)).toBeInTheDocument();
    for (const block of ["Informations personnelles", "Équipe", "Documents", "Historique"]) {
      expect(screen.getByRole("button", { name: block })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/employees/emp-1/edit");
  });

  it("shows a manager the name, department, position and contact only", async () => {
    server.use(http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeTeamMember())));

    mount("team");

    expect(await screen.findByRole("heading", { name: "Amal Employee" })).toBeInTheDocument();
    for (const text of ["Souscription", "Chargé de clientèle", "employee.a1@impactrisks.com", "20 123 456"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Matricule")).not.toBeInTheDocument();
    for (const block of ["Informations personnelles", "Documents", "Historique", "Équipe"]) {
      expect(screen.queryByRole("button", { name: block })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
  });

  it("lets an executive read everything and change nothing", async () => {
    mount("overview");

    await open("Documents");
    expect(await screen.findByRole("link", { name: "Télécharger Contrat" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.getByText("Réservé aux RH")).toBeInTheDocument();
    await open("Équipe");
    expect(await screen.findByRole("link", { name: "Bilel Employee" })).toHaveAttribute(
      "href",
      "/overview/people/emp-5",
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    for (const action of ["Ajouter un document", "Nommer un délégué", "Changer de responsable"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: action })).not.toBeInTheDocument();
    }
  });

  it("says not available for a record outside reach", async () => {
    server.use(http.get("/api/v1/employees/nobody", () => problem(404, "core.not_found", [])));

    mount("hr", "nobody");

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });

  it("lets HR share a document and add one", async () => {
    let shared: unknown;
    let uploaded = false;
    server.use(
      http.patch("/api/v1/employees/emp-1/documents/11", async ({ request }) => {
        shared = await request.json();
        return HttpResponse.json(makeDocument({ visible_to_employee: true }));
      }),
      http.post("/api/v1/employees/emp-1/documents", () => {
        uploaded = true;
        return HttpResponse.json(makeDocument({ id: 12, label: "Avenant" }), { status: 201 });
      }),
    );
    mount("hr");
    await open("Documents");

    await userEvent.click(await screen.findByRole("checkbox", { name: "Partager Contrat avec l'employé" }));
    await waitFor(() => expect(shared).toEqual({ visible_to_employee: true }));

    await userEvent.click(screen.getByRole("button", { name: "Ajouter un document" }));
    const file = new File(["%PDF-1.4"], "avenant.pdf", { type: "application/pdf" });
    await userEvent.upload(await screen.findByLabelText("Fichier"), file);
    await userEvent.type(screen.getByLabelText("Intitulé"), "Avenant");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(uploaded).toBe(true));
  });

  it("shows a refused file next to the file input", async () => {
    server.use(
      http.post("/api/v1/employees/emp-1/documents", () =>
        problem(400, "files.content_mismatch", [
          {
            field: "file",
            code: "files.content_mismatch",
            detail: "Le contenu de ce fichier ne correspond pas à son nom.",
          },
        ]),
      ),
    );
    mount("hr");
    await open("Documents");
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un document" }));

    await userEvent.upload(await screen.findByLabelText("Fichier"), new File(["MZ"], "facture.pdf"));
    await userEvent.type(screen.getByLabelText("Intitulé"), "Facture");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le contenu de ce fichier ne correspond pas à son nom.")).toBeInTheDocument();
    expect(screen.getByLabelText("Intitulé")).toHaveValue("Facture");
  });

  it("tells in the history what changed, from what to what, by whom", async () => {
    mount("hr");
    await open("Historique");

    expect(await screen.findByText("Fiche modifiée")).toBeInTheDocument();
    expect(screen.getByText(/^Senna RH, le /)).toBeInTheDocument();
    expect(screen.getByText("Téléphone : (vide) → 71 000 000")).toBeInTheDocument();
    expect(screen.getByText("Statut : En poste → Suspendu")).toBeInTheDocument();
  });

  it("leaves out of the history a field that went from nothing to nothing", async () => {
    server.use(
      http.get("/api/v1/employees/emp-1/history", () =>
        HttpResponse.json(
          pageOf([
            {
              id: 1,
              at: "2026-10-01T09:00:00+01:00",
              actor: "Senna RH",
              category: "business",
              action: "employee.created",
              object_type: "employee",
              object_id: "emp-1",
              object_label: "Amal Employee",
              changes: { first_name: { before: null, after: "Amal" }, address: { before: null, after: "" } },
              ip_address: null,
              request_id: "r-0",
            },
          ]),
        ),
      ),
    );
    mount("hr");
    await open("Historique");

    expect(await screen.findByText("Fiche créée")).toBeInTheDocument();
    expect(screen.getByText("Prénom : (vide) → Amal")).toBeInTheDocument();
    expect(screen.queryByText(/^Adresse :/)).not.toBeInTheDocument();
  });

  it("lists the team and the delegation, and lets HR name a delegate", async () => {
    mount("hr");
    await open("Équipe");

    expect(await screen.findByRole("link", { name: "Bilel Employee" })).toHaveAttribute(
      "href",
      "/hr/employees/emp-5",
    );
    expect(screen.getByText(/^Nadia Manager, du /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer maintenant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Changer de responsable" })).toHaveAttribute(
      "href",
      "/hr/employees/emp-1/edit",
    );

    await userEvent.click(screen.getByRole("button", { name: "Nommer un délégué" }));
    expect(await screen.findByText("Nommer un délégué pour Amal Employee")).toBeInTheDocument();
  });
});
