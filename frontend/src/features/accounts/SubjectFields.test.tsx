import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import CreateAccountPage from "./CreateAccountPage";

const LEILA = { public_id: "emp-8", full_name: "Leila Ayari", email: "leila.ayari@impactrisks.com" };

const created = {
  account: {
    public_id: "a9",
    email: LEILA.email,
    name: LEILA.full_name,
    state: "awaiting_first_sign_in",
    roles: [],
    last_login_at: null,
    has_employee: true,
  },
  temporary_password: "Xk7-temp-Pass-2209",
  expires_at: "2026-10-06T10:00:00+01:00",
};

const open = () => renderApp(<CreateAccountPage />, { route: "/admin/accounts/new" });

describe("SubjectFields", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/accounts/candidates", () => HttpResponse.json([LEILA])));
  });

  it("offers the employees without an account and still asks for a name and an email by default", async () => {
    open();

    expect(await screen.findByRole("option", { name: "Leila Ayari" })).toBeInTheDocument();
    expect(screen.getByLabelText("Employé")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Aucun : compte sans fiche d'employé" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toBeInTheDocument();
  });

  it("creates the account of an employee from the record alone", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/accounts", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });

    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    expect(screen.queryByLabelText("Nom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse e-mail professionnelle")).not.toBeInTheDocument();
    expect(
      screen.getByText("Le compte utilisera le nom de la fiche et l'adresse leila.ayari@impactrisks.com."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Compte créé pour Leila Ayari" })).toBeInTheDocument();
    expect(body).toEqual({ employee: "emp-8", roles: [] });
  });

  it("keeps what was typed when the administrator goes back to a name and an email", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });

    await user.type(screen.getByLabelText("Nom"), "Karim Admin");
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");
    await user.selectOptions(screen.getByLabelText("Employé"), "");

    expect(screen.getByLabelText("Nom")).toHaveValue("Karim Admin");
  });

  it("shows a refusal about the employee next to the choice and keeps the choice", async () => {
    const user = userEvent.setup();
    const detail = "Cette personne a déjà un compte.";
    server.use(
      http.post("/api/v1/accounts", () =>
        problemResponse(409, "accounts.employee_has_account", detail, [{ field: "employee" }]),
      ),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Employé")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Employé")).toHaveAccessibleDescription(expect.stringContaining(detail));
    expect(screen.getByLabelText("Employé")).toHaveValue("emp-8");
  });

  it("shows a refusal about the address of the record although its input is hidden", async () => {
    const user = userEvent.setup();
    const detail = "Cette adresse est déjà utilisée par un compte.";
    server.use(
      http.post("/api/v1/accounts", () => problemResponse(400, "accounts.email_taken", detail, [{ field: "email" }])),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByText(detail)).toBeInTheDocument();
  });

  it("does not offer the choice when every employee has an account", async () => {
    let asked = false;
    server.use(
      http.get("/api/v1/accounts/candidates", () => {
        asked = true;
        return HttpResponse.json([]);
      }),
    );
    open();

    await waitFor(() => expect(asked).toBe(true));
    expect(screen.getByLabelText("Nom")).toBeInTheDocument();
    expect(screen.queryByLabelText("Employé")).not.toBeInTheDocument();
  });
});
