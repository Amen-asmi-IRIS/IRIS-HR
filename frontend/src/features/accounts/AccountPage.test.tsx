import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDetail } from "@/api/types";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AccountPage from "./AccountPage";

const PASSWORD = "Rk4-temp-Pass-7781";

function makeDetail(overrides: Partial<AccountDetail> = {}): AccountDetail {
  return {
    public_id: "a1",
    email: "sami.benali@impactrisks.com",
    name: "Sami Ben Ali",
    state: "active",
    roles: ["employee", "hr"],
    last_login_at: "2026-10-05T09:00:00+01:00",
    has_employee: true,
    role_assignments: [{ role: "hr", assigned_by: "Sonia Admin", assigned_at: "2026-09-01T10:00:00+01:00" }],
    previous_login_at: "2026-10-03T08:00:00+01:00",
    failed_attempts: 2,
    locked_until: null,
    created_at: "2026-09-01T09:30:00+01:00",
    created_by: null,
    can_enable: false,
    recent_events: [
      {
        id: 9,
        at: "2026-10-05T09:00:00+01:00",
        actor: "Sami Ben Ali",
        category: "security",
        action: "auth.login",
        object_type: "user",
        object_id: "a1",
        object_label: "sami.benali@impactrisks.com",
        changes: {},
        ip_address: "10.0.0.7",
        request_id: "r9",
      },
    ],
    ...overrides,
  } as AccountDetail;
}

/** The account the API holds; actions replace it, as the real API would. */
let current: AccountDetail;

beforeEach(() => {
  current = makeDetail();
  server.use(http.get("/api/v1/accounts/a1", () => HttpResponse.json(current)));
});

const open = (props: { readOnly?: boolean } = {}, me = makeMe()) => renderApp(<AccountPage {...props} />, { route: "/admin/accounts/a1", me });
const plain = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("AccountPage", () => {
  it("opens on a summary and keeps the details one step away", async () => {
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Sami Ben Ali" })).toBeInTheDocument();
    expect(screen.getByText("sami.benali@impactrisks.com")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Employé, RH")).toBeInTheDocument();
    expect(plain(document.body)).toContain("5 oct. 2026 à 09:00");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
    expect(screen.queryByText("Échecs de connexion consécutifs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Détails" }));
    expect(plain(document.body)).toContain("RH : attribué par Sonia Admin le 1 sept. 2026 à 10:00");
    expect(screen.getByText("Échecs de connexion consécutifs")).toBeInTheDocument();
    expect(plain(document.body)).toContain("3 oct. 2026 à 08:00");
    const events = screen.getByRole("list", { name: "Événements de sécurité récents" });
    expect(within(events).getByText("Connexion")).toBeInTheDocument();
    expect(within(events).getByText("10.0.0.7")).toBeInTheDocument();
  });

  it("resets the password after a confirmation and shows the temporary one once", async () => {
    const user = userEvent.setup();
    const asked = vi.fn();
    server.use(
      http.post("/api/v1/accounts/a1/reset-password", () => {
        asked();
        return HttpResponse.json({ temporary_password: PASSWORD, expires_at: "2026-10-06T10:00:00+01:00" });
      }),
    );
    const { router, queryClient } = open();
    await user.click(await screen.findByRole("button", { name: "Réinitialiser le mot de passe" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Réinitialiser ce mot de passe ?" });
    expect(confirm).toHaveAccessibleDescription(
      "Le mot de passe actuel cesse de fonctionner immédiatement. Un mot de passe temporaire est affiché une seule fois, à remettre en main propre.",
    );
    expect(asked).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Réinitialiser le mot de passe" }));

    const sheet = await screen.findByRole("dialog", { name: "Mot de passe temporaire" });
    expect(within(sheet).getByText(PASSWORD)).toBeInTheDocument();
    expect(plain(sheet)).toContain("Il expire le 6 oct. 2026 à 10:00.");
    const kept = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + router.state.location.pathname + router.state.location.search;
    expect(kept).not.toContain(PASSWORD);

    await user.click(within(sheet).getByRole("button", { name: "Terminé" }));
    await waitFor(() => expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument());
    expect(asked).toHaveBeenCalledTimes(1);
    // The page is still open, yet nothing in the application holds the password any more.
    await waitFor(() => {
      const cached = [...queryClient.getMutationCache().getAll(), ...queryClient.getQueryCache().getAll()].map((entry) => entry.state.data);
      expect(JSON.stringify(cached)).not.toContain(PASSWORD);
    });
  });

  it("offers to unlock only a locked account", async () => {
    const user = userEvent.setup();
    current = makeDetail({ state: "locked", locked_until: "2026-10-05T09:30:00+01:00" });
    server.use(
      http.post("/api/v1/accounts/a1/unlock", () => {
        current = makeDetail({ state: "active" });
        return HttpResponse.json(current);
      }),
    );
    open();
    expect(await screen.findByText("Verrouillé")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    expect(await screen.findByText("Actif")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Compte déverrouillé.");
    expect(screen.queryByRole("button", { name: "Déverrouiller" })).not.toBeInTheDocument();
  });

  it("disables after stating the consequence, then offers to enable", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/accounts/a1/disable", () => {
        current = makeDetail({ state: "disabled", can_enable: true });
        return HttpResponse.json(current);
      }),
      http.post("/api/v1/accounts/a1/enable", () => {
        current = makeDetail({ state: "active" });
        return HttpResponse.json(current);
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: "Désactiver" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Désactiver ce compte ?" });
    expect(confirm).toHaveAccessibleDescription("La personne est déconnectée immédiatement et ne peut plus se connecter.");
    await user.click(within(confirm).getByRole("button", { name: "Désactiver le compte" }));
    expect(await screen.findByText("Désactivé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Désactiver" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activer" }));
    expect(await screen.findByText("Actif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Désactiver" })).toBeInTheDocument();
  });

  it("shows the server's refusal and leaves the account as it is", async () => {
    const user = userEvent.setup();
    current = makeDetail({ roles: ["sysadmin"] });
    server.use(http.post("/api/v1/accounts/a1/disable", () => problemResponse(409, "accounts.last_sysadmin", "Le dernier administrateur actif ne peut pas être désactivé.")));
    open();
    await user.click(await screen.findByRole("button", { name: "Désactiver" }));
    await user.click(await screen.findByRole("button", { name: "Désactiver le compte" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Le dernier administrateur actif ne peut pas être désactivé."));
    expect(screen.getByText("Actif")).toBeInTheDocument();
  });

  it("does not offer to enable the account of someone who has left, and says why", async () => {
    current = makeDetail({ state: "disabled", can_enable: false });
    open();
    expect(await screen.findByText("Désactivé")).toBeInTheDocument();
    expect(screen.getByText("Cette personne a quitté l'entreprise : le compte ne peut pas être réactivé.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Désactiver" })).not.toBeInTheDocument();
    // What still applies to the account stays.
    expect(screen.getByRole("button", { name: "Modifier les rôles" })).toBeInTheDocument();
  });

  it("says nothing about a departure on an account that can be enabled", async () => {
    current = makeDetail({ state: "disabled", can_enable: true });
    open();
    expect(await screen.findByRole("button", { name: "Activer" })).toBeInTheDocument();
    expect(screen.queryByText(/a quitté l'entreprise/)).not.toBeInTheDocument();
  });

  it("shows the server's refusal when the person left after the page was opened", async () => {
    const user = userEvent.setup();
    const refusal = "Cette personne a quitté l'entreprise : le compte ne peut pas être réactivé.";
    current = makeDetail({ state: "disabled", can_enable: true });
    server.use(http.post("/api/v1/accounts/a1/enable", () => problemResponse(409, "accounts.employee_left", refusal)));
    open();
    await user.click(await screen.findByRole("button", { name: "Activer" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(refusal));
    expect(screen.getByText("Désactivé")).toBeInTheDocument();
  });

  it("adds and removes roles, and explains the one it does not offer", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.post("/api/v1/accounts/a1/roles", async ({ request }) => {
        const body = (await request.json()) as { role: string };
        calls.push(`add ${body.role}`);
        current = makeDetail({ roles: ["employee", "exec", "hr"] });
        return HttpResponse.json(current);
      }),
      http.delete("/api/v1/accounts/a1/roles/:role", ({ params }) => {
        calls.push(`remove ${String(params.role)}`);
        current = makeDetail({ roles: ["employee", "exec"] });
        return HttpResponse.json(current);
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: "Modifier les rôles" }));
    const sheet = await screen.findByRole("dialog", { name: "Rôles de Sami Ben Ali" });
    expect(within(sheet).getByText("Administrateur système ne peut pas être ajouté à un compte qui détient RH.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Ajouter : Administrateur système" })).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Ajouter : Direction générale" }));
    expect(await within(sheet).findByRole("button", { name: "Retirer : Direction générale" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Retirer : RH" }));
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Ajouter : RH" })).toBeInTheDocument());
    expect(calls).toEqual(["add exec", "remove hr"]);
    expect(within(sheet).getByRole("button", { name: "Ajouter : Administrateur système" })).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Terminé" }));
    expect(await screen.findByText("Employé, Direction générale")).toBeInTheDocument();
  });

  it("offers no action on the administrator's own account", async () => {
    current = makeDetail({ public_id: "a1", roles: ["sysadmin"] });
    open({}, makeMe({ public_id: "a1" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sami Ben Ali" })).toBeInTheDocument();
    for (const name of ["Réinitialiser le mot de passe", "Désactiver", "Modifier les rôles"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("offers no action when it is read-only", async () => {
    current = makeDetail({ state: "locked" });
    open({ readOnly: true });
    expect(await screen.findByText("Verrouillé")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Détails"]);
  });

  it("shows 'not available' for an account that does not exist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("/api/v1/accounts/a1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    renderApp(
      <ProblemBoundary>
        <AccountPage />
      </ProblemBoundary>,
      { route: "/admin/accounts/a1" },
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
  });
});
