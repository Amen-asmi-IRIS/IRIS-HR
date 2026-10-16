import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import DepartmentsPositionsPage from "./DepartmentsPositionsPage";
import { makeDepartment, makePosition, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function mount(readOnly = false) {
  return renderApp(<DepartmentsPositionsPage readOnly={readOnly} />, { route: "/hr/settings/departments", me: hr });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("DepartmentsPositionsPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/departments", () =>
        HttpResponse.json([
          makeDepartment(),
          makeDepartment({ id: 2, code: "OLD", name: "Ancien service", is_active: false, employee_count: 0 }),
        ]),
      ),
      http.get("/api/v1/positions", () => HttpResponse.json([makePosition()])),
    );
  });

  it("lists departments with their head count and state, then positions", async () => {
    mount();

    await screen.findAllByText("Souscription");
    for (const text of ["UW", "3", "Actif", "Ancien service", "Inactif"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/peut être désactivé, pas supprimé/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Postes" }));
    await screen.findAllByText("Chargé de clientèle");
    expect(screen.getAllByText("C1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ajouter un poste" })).toBeInTheDocument();
  });

  it("adds a department", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/departments", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDepartment({ id: 9, code: "OPS", name: "Opérations" }), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un département" }));
    fill("Code", "OPS");
    fill("Nom en français", "Opérations");
    fill("Nom en anglais", "Operations");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(body).toEqual({ code: "OPS", name_fr: "Opérations", name_en: "Operations" }));
    await waitFor(() => expect(screen.queryByLabelText("Nom en français")).not.toBeInTheDocument());
  });

  it("shows a refused code next to the field and keeps what was typed", async () => {
    server.use(
      http.post("/api/v1/departments", () =>
        problem(400, "unique", [{ field: "code", code: "unique", detail: "Ce champ doit être unique." }]),
      ),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un département" }));
    fill("Code", "UW");
    fill("Nom en français", "Doublon");
    fill("Nom en anglais", "Duplicate");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Ce champ doit être unique.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom en français")).toHaveValue("Doublon");
  });

  it("edits and deactivates a department that is in use", async () => {
    let body: unknown;
    server.use(
      http.patch("/api/v1/departments/1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDepartment({ is_active: false }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Modifier UW" }));
    expect(screen.getByLabelText("Nom en français")).toHaveValue("Souscription");
    await userEvent.click(screen.getByLabelText("Actif"));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(body).toEqual({ code: "UW", name_fr: "Souscription", name_en: "Underwriting", is_active: false }),
    );
  });

  it("renders no action when read-only", async () => {
    mount(true);

    await screen.findAllByText("Souscription");
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument();
  });
});
