import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeeFormPage from "./EmployeeFormPage";
import { makeDepartment, makeEmployee, makePosition, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

/** `renderApp` shows `data-testid="elsewhere"` with the address once the page navigates away. */
function mount(route: string) {
  const path = route.endsWith("/new") ? "/hr/employees/new" : "/hr/employees/:id/edit";
  return renderApp(
    <ProblemBoundary>
      <EmployeeFormPage />
    </ProblemBoundary>,
    { route, path, me: hr },
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("EmployeeFormPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/departments", () => HttpResponse.json([makeDepartment()])),
      http.get("/api/v1/positions", () => HttpResponse.json([makePosition()])),
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([{ public_id: "emp-3", name: "Mounir Manager", department: "Souscription" }]),
      ),
    );
  });

  it("names the mandatory fields before calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/employees", () => {
        posted = true;
        return HttpResponse.json(makeEmployee(), { status: 201 });
      }),
    );
    mount("/hr/employees/new");

    await userEvent.click(await screen.findByRole("button", { name: "Enregistrer" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(8);
    expect(posted).toBe(false);
  });

  it("creates an employee and opens the record", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post("/api/v1/employees", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeEmployee({ public_id: "new-1" }), { status: 201 });
      }),
    );
    mount("/hr/employees/new");
    await screen.findByRole("option", { name: "Souscription" });
    await screen.findByRole("option", { name: "Chargé de clientèle" });
    await screen.findByRole("option", { name: "Mounir Manager · Souscription" });

    fill("Matricule", "E100");
    fill("Prénom", "Nour");
    fill("Nom", "Nouvelle");
    fill("E-mail professionnel", "nour.nouvelle@impactrisks.com");
    fill("Date d'embauche", "2026-11-02");
    fill("Type de contrat", "permanent");
    fill("Département", "1");
    fill("Poste", "4");
    fill("Responsable", "emp-3");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/hr/employees/new-1");
    expect(body).toMatchObject({
      employee_number: "E100",
      first_name: "Nour",
      last_name: "Nouvelle",
      professional_email: "nour.nouvelle@impactrisks.com",
      hire_date: "2026-11-02",
      contract_type: "permanent",
      department: 1,
      position: 4,
      manager: "emp-3",
      date_of_birth: null,
      contract_end_date: null,
    });
    expect(body).not.toHaveProperty("status");
  });

  it("shows server problems next to their fields and keeps what was typed", async () => {
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.patch("/api/v1/employees/emp-1", () =>
        problem(400, "organisation.number_taken", [
          {
            field: "employee_number",
            code: "organisation.number_taken",
            detail: "Ce matricule est déjà utilisé. Saisissez un autre matricule.",
          },
          {
            field: "manager",
            code: "organisation.manager_loop",
            detail: "Cette personne dépend, directement ou non, de l'employé.",
          },
        ]),
      ),
    );
    mount("/hr/employees/emp-1/edit");
    await waitFor(() => expect(screen.getByLabelText("Matricule")).toHaveValue("E004"));

    fill("Téléphone", "71 000 000");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Ce matricule est déjà utilisé. Saisissez un autre matricule.")).toBeInTheDocument();
    expect(screen.getByText("Cette personne dépend, directement ou non, de l'employé.")).toBeInTheDocument();
    expect(screen.getByLabelText("Téléphone")).toHaveValue("71 000 000");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("sends the status only when editing", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.patch("/api/v1/employees/emp-1", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeEmployee({ status: "suspended" }));
      }),
    );
    mount("/hr/employees/emp-1/edit");
    await waitFor(() => expect(screen.getByLabelText("Matricule")).toHaveValue("E004"));

    fill("Statut", "suspended");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/hr/employees/emp-1");
    expect(body).toMatchObject({ status: "suspended", employee_number: "E004", manager: "emp-3" });
  });

  it("keeps the form and what was typed while the application is away", async () => {
    server.use(http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())));
    const { queryClient } = mount("/hr/employees/emp-1/edit");
    await waitFor(() => expect(screen.getByLabelText("Matricule")).toHaveValue("E004"));
    fill("Téléphone", "71 000 000");

    // Neither the save nor a later reading of the record is answered by the application.
    const away = () => new HttpResponse("<html>Service unavailable</html>", { status: 503 });
    server.use(http.patch("/api/v1/employees/emp-1", away), http.get("/api/v1/employees/emp-1", away));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      await screen.findByText("L'application est en cours de mise à jour. Elle sera de retour dans un instant."),
    ).toBeInTheDocument();
    // A later reading (a return to the window) fails too; the page is then drawn again.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["employees", "detail", "emp-1"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(["employees", "detail", "emp-1"])?.status).toBe("error");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("71 000 000");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });

  it("says not available when the record cannot be read", async () => {
    server.use(http.get("/api/v1/employees/nobody", () => problem(404, "core.not_found", [])));

    mount("/hr/employees/nobody/edit");

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
