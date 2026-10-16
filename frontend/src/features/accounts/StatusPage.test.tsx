import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { AdminStatus } from "@/api/types";
import { HOMES } from "@/app/homes";
import { visibleNav } from "@/app/navigation";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import StatusPage from "./StatusPage";

const healthy = {
  health: { status: "ok", app: "ok", database: "ok", worker: "ok", version: "1.2.0", environment: "production" },
  accounts: { locked: [], awaiting_first_sign_in: [], temp_expired: [], employees_without_account: [] },
  jobs: [
    {
      name: "core.heartbeat",
      schedule: "* * * * *",
      last_started_at: "2026-10-05T09:00:00+01:00",
      last_finished_at: "2026-10-05T09:00:01+01:00",
      last_ok: true,
      last_detail: "",
      next_run_at: "2026-10-05T09:01:00+01:00",
    },
  ],
  backup: null,
} as unknown as AdminStatus;

const troubled = {
  health: { status: "degraded", app: "ok", database: "fail", worker: "stale", version: "1.2.0", environment: "test" },
  accounts: {
    locked: [{ public_id: "a1", name: "Sami Ben Ali", email: "sami.benali@impactrisks.com" }],
    awaiting_first_sign_in: [{ public_id: "a2", name: "Leila Trabelsi", email: "leila.trabelsi@impactrisks.com" }],
    temp_expired: [],
    employees_without_account: [{ public_id: "e9", name: "Nour Gharbi", email: "nour.gharbi@impactrisks.com" }],
  },
  jobs: [
    {
      name: "accounts.cleanup",
      schedule: "30 2 * * *",
      last_started_at: "2026-10-05T02:30:00+01:00",
      last_finished_at: "2026-10-05T02:30:02+01:00",
      last_ok: false,
      last_detail: "connexion refusée",
      next_run_at: "2026-10-06T02:30:00+01:00",
    },
    { name: "ops.backup", schedule: "30 23 * * *", last_started_at: null, last_finished_at: null, last_ok: null, last_detail: "", next_run_at: "2026-10-05T23:30:00+01:00" },
  ],
  backup: { last_at: "2026-10-04T23:30:00+01:00", size_bytes: 13_002_342, storage_used_bytes: 3_221_225_472 },
} as unknown as AdminStatus;

const answers = (status: AdminStatus) => http.get("/api/v1/admin/status", () => HttpResponse.json(status));
const plain = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("StatusPage", () => {
  it("is the home of Administration", () => {
    expect(HOMES.admin).toBeDefined();
    expect(visibleNav("admin")[0].path).toBe("/admin");
  });

  it("says in one line that everything works, and offers to create an account", async () => {
    server.use(answers(healthy));
    renderApp(<StatusPage />, { route: "/admin" });
    expect(screen.getByRole("heading", { level: 1, name: "État" })).toBeInTheDocument();
    expect(await screen.findByText("Tout fonctionne.")).toBeInTheDocument();
    expect(screen.getByText("Version 1.2.0, environnement de production")).toBeInTheDocument();
    expect(screen.getByText("Aucun compte ne nécessite d'attention.")).toBeInTheDocument();
    expect(screen.getByText("Aucune sauvegarde n'a encore été faite.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/admin/accounts/new");

    const jobs = screen.getByRole("table", { name: "Tâches planifiées" });
    const row = within(jobs).getAllByRole("row")[1];
    expect(within(row).getByText("Signal de vie du service de tâches")).toBeInTheDocument();
    expect(within(row).getByText("Terminée")).toBeInTheDocument();
    expect(plain(row)).toContain("5 oct. 2026 à 09:00");
    expect(plain(row)).toContain("5 oct. 2026 à 09:01");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });

  it("names what fails, who cannot get in, which work failed and the last backup", async () => {
    server.use(answers(troubled));
    renderApp(<StatusPage />, { route: "/admin" });
    expect(await screen.findByText("Ne fonctionne pas : la base de données, les tâches de fond.")).toBeInTheDocument();

    const attention = screen.getByRole("region", { name: "Comptes à traiter" });
    expect(within(attention).getByText("Verrouillés")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "Sami Ben Ali" })).toHaveAttribute("href", "/admin/accounts/a1");
    expect(within(attention).getByText("Mot de passe temporaire jamais utilisé")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "Leila Trabelsi" })).toHaveAttribute("href", "/admin/accounts/a2");
    expect(within(attention).queryByText("Mot de passe temporaire expiré")).not.toBeInTheDocument();
    expect(within(attention).getByText("Employés sans compte")).toBeInTheDocument();
    expect(within(attention).getByText("Nour Gharbi")).toBeInTheDocument();
    expect(within(attention).queryByRole("link", { name: "Nour Gharbi" })).not.toBeInTheDocument();

    const jobs = screen.getByRole("table", { name: "Tâches planifiées" });
    expect(within(jobs).getByText("Échec : connexion refusée")).toBeInTheDocument();
    expect(within(jobs).getByText("Pas encore exécutée")).toBeInTheDocument();

    const backup = screen.getByRole("region", { name: "Sauvegarde" });
    expect(plain(backup)).toContain("Dernière sauvegarde : 4 oct. 2026 à 23:30.");
    expect(plain(backup)).toContain("Taille : 12,4 Mo.");
    expect(plain(backup)).toContain("Espace utilisé par les sauvegardes : 3 Go.");
  });

  it("offers no action when it is read-only", async () => {
    server.use(answers(troubled));
    renderApp(<StatusPage readOnly />, { route: "/admin" });
    expect(await screen.findByText("Verrouillés")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Sami Ben Ali")).toBeInTheDocument();
  });
});
