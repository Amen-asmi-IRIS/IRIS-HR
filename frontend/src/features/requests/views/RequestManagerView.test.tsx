import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequestDetail, paginated, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const toDecide: DetailOverrides = {
  comment: "Voyage en famille",
  viewer: { relation: "approver", actions: ["decide"], step_id: 7 },
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [{ name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" }],
    cap: null,
  },
};

const sickDeclaration: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  attachments: [],
  viewer: { relation: "team", actions: [], step_id: null },
  decision_context: { balance: null, teammates_away: [], cap: null },
};

function serve(detail: DetailOverrides) {
  const calls = { decide: [] as unknown[] };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    http.get("/api/v1/approvals", () => HttpResponse.json(paginated([]))),
    http.post("/api/v1/steps/7/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ ...detail, viewer: { relation: "team", actions: [], step_id: null } }));
    }),
  );
  return calls;
}

function open(workspace: WorkspaceId = "team") {
  const workspaces: WorkspaceId[] = workspace === "team" ? ["me", "team"] : ["me"];
  renderApp(<RequestPage />, {
    route: `/${workspace}/requests/req-1`,
    path: `/${workspace}/requests/:id`,
    me: makeMe({ roles: ["employee", "manager"], workspaces }),
  });
}

describe("Request, manager view (UI 6.2)", () => {
  it("shows who asks, the dates, what is needed to decide and the comment", async () => {
    serve(toDecide);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(within(summary).getByText(/Souscription/)).toBeInTheDocument();
    expect(within(summary).getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(within(summary).getByText("En attente de votre décision")).toBeInTheDocument();
    expect(within(summary).getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
    expect(
      within(summary).getByText("Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12))"),
    ).toBeInTheDocument();
    expect(within(summary).getByText("Voyage en famille")).toBeInTheDocument();
  });

  it("offers approve, refuse and send back", async () => {
    serve(toDecide);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
  });

  it("offers to approve or refuse a change to an approved request, never to send it back", async () => {
    serve({
      ...toDecide,
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
    });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Modification à décider")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(within(summary).queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("says when nobody else is away", async () => {
    serve({ ...toDecide, decision_context: { balance: null, teammates_away: [], cap: null } });
    open();
    expect(await screen.findByText("Personne d'autre de l'équipe n'est absent ces jours-là.")).toBeInTheDocument();
  });

  it("approves through the sheet and returns to the queue", async () => {
    const calls = serve(toDecide);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 1 }]));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team"));
  });

  it("a sick-leave declaration is information only", async () => {
    serve(sickDeclaration);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(screen.getByRole("heading", { name: "Congé maladie" })).toBeInTheDocument();
    expect(
      within(summary).getByText("Déclaration transmise pour information : vous n'avez aucune décision à prendre."),
    ).toBeInTheDocument();
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryByText("Commentaire")).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
    expect(screen.queryByText("Fichiers")).not.toBeInTheDocument();
    expect(screen.queryByText("Commentaire et fichiers")).not.toBeInTheDocument();
  });

  it("shows no decision, and no notice, for a team request that is not mine to decide", async () => {
    serve({ ...toDecide, state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" }, viewer: { relation: "team", actions: [], step_id: null } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryByText(/pour information/)).not.toBeInTheDocument();
    expect(within(summary).getByText("Approuvée par Sami Ben Ali ; en attente des RH")).toBeInTheDocument();
  });

  it("puts non-medical files one step away", async () => {
    serve({
      ...toDecide,
      attachments: [
        { public_id: "att-1", kind: "proof", name: "faire-part.pdf", size: 1024, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Fichiers"));
    expect(await screen.findByRole("link", { name: "faire-part.pdf" })).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
  });

  it("gives a named approver without a team the same view under My space", async () => {
    serve(toDecide);
    open("me");
    expect(await screen.findByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(screen.getByText("En attente de votre décision")).toBeInTheDocument();
  });
});
