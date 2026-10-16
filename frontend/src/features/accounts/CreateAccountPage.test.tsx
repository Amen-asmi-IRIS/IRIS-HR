import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import CreateAccountPage from "./CreateAccountPage";

const PASSWORD = "Xk7-temp-Pass-2209";

const created = {
  account: { public_id: "a9", email: "karim.admin@impactrisks.com", name: "Karim Admin", state: "awaiting_first_sign_in", roles: ["sysadmin"], last_login_at: null, has_employee: false },
  temporary_password: PASSWORD,
  expires_at: "2026-10-06T10:00:00+01:00",
};

const open = () => renderApp(<CreateAccountPage />, { route: "/admin/accounts/new" });

async function fill(user: UserEvent, name = "Karim Admin", email = "karim.admin@impactrisks.com") {
  await user.type(screen.getByLabelText("Nom"), name);
  await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), email);
}

describe("CreateAccountPage", () => {
  it("shows the temporary password once and keeps it out of storage", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/accounts", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { router, queryClient } = open();
    expect(screen.getByRole("heading", { level: 1, name: "Créer un compte" })).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "Administrateur système" }));
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Compte créé pour Karim Admin" })).toBeInTheDocument();
    expect(body).toEqual({ full_name: "Karim Admin", email: "karim.admin@impactrisks.com", roles: ["sysadmin"] });
    expect(screen.getByText(PASSWORD)).toBeInTheDocument();
    expect(screen.getByText("Remettez ce mot de passe en main propre. Il n'est affiché qu'une seule fois.")).toBeInTheDocument();
    expect((document.body.textContent ?? "").replace(/\s/g, " ")).toContain("Il expire le 6 oct. 2026 à 10:00.");
    expect(screen.queryByRole("button", { name: "Créer le compte" })).not.toBeInTheDocument();

    const kept = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + router.state.location.pathname + router.state.location.search;
    expect(kept).not.toContain(PASSWORD);

    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts");
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
    // Once the page is left, no cache of the application holds the answer that carried the password.
    await waitFor(() => {
      const cached = [...queryClient.getMutationCache().getAll(), ...queryClient.getQueryCache().getAll()].map((entry) => entry.state.data);
      expect(JSON.stringify(cached)).not.toContain(PASSWORD);
    });
  });

  it.each([
    ["auth.domain_not_allowed", "email", "Seules les adresses @impactrisks.com sont acceptées."],
    ["accounts.email_taken", "email", "Cette adresse est déjà utilisée par un compte."],
    ["accounts.roles_incompatible", "roles", "RH et Administrateur système ne peuvent pas être réunis sur un même compte."],
    ["accounts.employee_has_account", "employee", "Cette personne a déjà un compte."],
  ])("shows the refusal %s where it belongs and keeps what was typed", async (code, field, detail) => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/accounts", () => problemResponse(400, code, detail, [{ field }])));
    open();
    await fill(user, "Karim Admin", "karim@gmail.com");
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Karim Admin");
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue("karim@gmail.com");
    if (field === "email") {
      expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveAccessibleDescription(detail);
    }
  });

  it("refuses HR together with System Administrator before calling the API", async () => {
    const user = userEvent.setup();
    const called = vi.fn();
    server.use(
      http.post("/api/v1/accounts", () => {
        called();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    open();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "RH" }));
    await user.click(screen.getByRole("checkbox", { name: "Administrateur système" }));
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect(await screen.findByText("RH et Administrateur système ne peuvent pas être réunis sur un même compte.")).toBeInTheDocument();
    expect(called).not.toHaveBeenCalled();
  });

  it("asks for a name and an email", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    await waitFor(() => expect(screen.getAllByText("Ce champ est obligatoire.")).toHaveLength(2));
  });

  it("leads back to the list", () => {
    open();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
  });
});
