import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeRequestDetail, makeStep, type DetailOverrides } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const asObserver = { relation: "overview" as const, actions: [], step_id: null };

const leave: DetailOverrides = {
  comment: "Voyage en famille",
  viewer: asObserver,
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [{ name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" }],
    cap: null,
  },
  attachments: [
    { public_id: "att-1", kind: "proof", name: "faire-part.pdf", size: 1024, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
  ],
};

/** A sick leave as the API gives it to anyone but the requester and HR. */
const sick: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  attachments: [],
  steps: [
    makeStep({ mode: "notify", status: "notified" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  viewer: asObserver,
  decision_context: { balance: null, teammates_away: [], cap: null },
};

function serve(detail: DetailOverrides) {
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
  );
}

function open(workspaces: WorkspaceId[] = ["me", "overview"]) {
  renderApp(<RequestPage />, {
    route: "/overview/requests/req-1",
    path: "/overview/requests/:id",
    me: makeMe({ roles: ["employee", "exec"], workspaces }),
  });
}

const summary = async () => within(await screen.findByRole("region", { name: "Résumé de la demande" }));

describe("Request, overview view (UI 8.3, 10.2)", () => {
  it("shows who, the dates, the status, the comment and what an approver would see", async () => {
    serve(leave);
    open();
    const region = await summary();
    expect(region.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("3 j")).toBeInTheDocument();
    expect(region.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(region.getByText("Voyage en famille")).toBeInTheDocument();
    expect(region.getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
    expect(
      region.getByText("Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12))"),
    ).toBeInTheDocument();
  });

  it("contains no action", async () => {
    serve(leave);
    open();
    const region = await summary();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    expect(region.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Autres actions RH" })).not.toBeInTheDocument();
  });

  it("never shows the comment or the certificate", async () => {
    serve(sick);
    open();
    const region = await summary();
    expect(screen.getByRole("heading", { name: "Congé maladie" })).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("En attente des RH")).toBeInTheDocument();
    expect(region.queryByText("Commentaire")).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Document/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fichiers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commentaire et fichiers" })).not.toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    // The steps are there, and say nothing either.
    await userEvent.click(screen.getByRole("button", { name: "Étapes" }));
    expect(await screen.findByText("Pour information")).toBeInTheDocument();
    expect(screen.queryByText(/«/)).not.toBeInTheDocument();
  });

  it("keeps the steps, the history and the non-medical files one step away", async () => {
    serve(leave);
    open();
    await summary();
    await userEvent.click(screen.getByRole("button", { name: "Étapes" }));
    expect(await screen.findByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fichiers" }));
    expect(await screen.findByRole("link", { name: "faire-part.pdf" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.getByRole("button", { name: "Historique complet" })).toBeInTheDocument();
  });

  it("stays read-only for someone who could decide, and says where the decision is taken", async () => {
    serve({ ...leave, viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
    open(["me", "team", "overview"]);
    const region = await summary();
    expect(region.queryByRole("button", { name: "Approuver" })).not.toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    expect(
      region.getByText("Cette demande attend votre décision. La vue d'ensemble est en lecture seule : la décision se prend ailleurs."),
    ).toBeInTheDocument();
    expect(region.getByRole("link", { name: "Ouvrir pour décider" })).toHaveAttribute("href", "/team/requests/req-1");
  });

  it("sends an executive who also holds HR to the HR desk to decide, even with a team", async () => {
    serve({ ...leave, viewer: { relation: "hr", actions: ["decide", "record_on_behalf", "reassign"], step_id: 8 } });
    open(["me", "team", "hr", "overview"]);
    const region = await summary();
    expect(region.getByRole("link", { name: "Ouvrir pour décider" })).toHaveAttribute("href", "/hr/requests/req-1");
  });

  it("sends an approver without a team to My space to decide", async () => {
    serve({ ...leave, viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
    open(["me", "overview"]);
    const region = await summary();
    expect(region.getByRole("link", { name: "Ouvrir pour décider" })).toHaveAttribute("href", "/me/requests/req-1");
  });
});
