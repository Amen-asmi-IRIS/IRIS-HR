import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { pickFile } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequestDetail, makeStep, paginated, problemResponse, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import RequestPage from "./RequestPage";
import { clearPending, undoConfig } from "./undoable";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

function serve(overrides: DetailOverrides = {}) {
  const detail = makeRequestDetail(overrides);
  const calls = { submit: [] as unknown[], withdraw: 0, uploads: 0, history: 0, withdrawChange: 0 };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(detail)),
    http.get("/api/v1/requests/req-1/history", () => {
      calls.history += 1;
      return HttpResponse.json([
        { at: "2026-10-28T09:12:00+01:00", actor: "Amal Trabelsi", action: "request.submitted", summary: "Demande envoyée", changes: null },
        { at: "2026-10-29T08:00:00+01:00", actor: null, action: "step.reminder", summary: "Rappel envoyé à Sami Ben Ali", changes: null },
      ]);
    }),
    http.get("/api/v1/requests", () => HttpResponse.json(paginated([detail]))),
    http.post("/api/v1/requests/req-1/submit", async ({ request }) => {
      calls.submit.push(await request.json());
      return HttpResponse.json(makeRequestDetail());
    }),
    http.post("/api/v1/requests/req-1/withdraw", () => {
      calls.withdraw += 1;
      return HttpResponse.json(makeRequestDetail({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] }, viewer: { actions: [] } }));
    }),
    http.post("/api/v1/requests/req-1/attachments", () => {
      calls.uploads += 1;
      return HttpResponse.json(
        { public_id: "att-9", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post("/api/v1/amendments/am-1/withdraw", () => {
      calls.withdrawChange += 1;
      return HttpResponse.json(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } }));
    }),
  );
  return calls;
}

const open = () => renderApp(<RequestPage />, { route: "/me/requests/req-1", path: "/me/requests/:id", me });
const control = (name: string) => screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name });

const openChange = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: [] };

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("Request, my view: shown first (UI 5.4, M6)", () => {
  it("shows the type, the dates, the length, where it stands and what happens next", async () => {
    serve();
    open();
    expect(await screen.findByRole("heading", { name: "Congé annuel" })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(within(summary).getByText("3 j")).toBeInTheDocument();
    expect(within(summary).getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(within(summary).getByText("Ensuite, les RH la valident.")).toBeInTheDocument();
    expect(within(summary).queryByText("Amal Trabelsi")).not.toBeInTheDocument();
  });

  it("shows the certificate sentence beside the state of a sick leave", async () => {
    serve({
      type: { code: "sick", name: "Congé maladie" },
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach", "withdraw"] },
    });
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("shows my balance today and after, when the API gives it (UI 10.2)", async () => {
    serve({ decision_context: { balance: { now: "12.50", after: "9.50" }, teammates_away: [], cap: null } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
  });

  it("is not available for a request outside the viewer's reach", async () => {
    serve();
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    open();
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});

describe("Request, my view: exactly the actions the API allows (UI 5.4, M8)", () => {
  const cases: { name: string; detail: DetailOverrides; shown: string[]; hidden: string[] }[] = [
    {
      name: "not sent yet",
      detail: { status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } },
      shown: ["Envoyer", "Modifier", "Supprimer le brouillon"],
      hidden: ["Retirer la demande", "Changer les dates", "Modifier et renvoyer"],
    },
    {
      name: "waiting, nobody decided yet",
      detail: { viewer: { actions: ["edit", "withdraw"] } },
      shown: ["Modifier", "Retirer la demande"],
      hidden: ["Envoyer", "Supprimer le brouillon", "Changer les dates"],
    },
    {
      name: "waiting, the manager already decided",
      detail: { state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" }, viewer: { actions: ["withdraw"] } },
      shown: ["Retirer la demande"],
      hidden: ["Modifier", "Envoyer"],
    },
    {
      name: "sent back",
      detail: {
        status: "returned",
        state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" },
        viewer: { actions: ["edit", "withdraw"] },
      },
      shown: ["Modifier et renvoyer", "Retirer la demande"],
      hidden: ["Modifier", "Envoyer"],
    },
    {
      name: "approved, not started",
      detail: { status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } },
      shown: ["Changer les dates", "Annuler la demande"],
      hidden: ["Modifier", "Retirer la demande", "Retirer la modification"],
    },
    {
      name: "sick leave, certificate due",
      detail: {
        type: { code: "sick", name: "Congé maladie" },
        state: { key: "waiting_hr", waiting_on: [], last_actor: null },
        certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
        viewer: { actions: ["attach", "withdraw"] },
      },
      shown: ["Ajouter le certificat", "Retirer la demande"],
      hidden: ["Ajouter un fichier", "Modifier"],
    },
    {
      name: "change waiting",
      detail: {
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: openChange,
        viewer: { actions: ["withdraw_amendment"] },
      },
      shown: ["Retirer la modification"],
      hidden: ["Changer les dates", "Annuler la demande"],
    },
    {
      name: "nothing left to do",
      detail: { status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: { actions: [] } },
      shown: [],
      hidden: ["Modifier", "Retirer la demande", "Envoyer", "Changer les dates"],
    },
  ];

  it.each(cases)("$name", async ({ detail, shown, hidden }) => {
    serve(detail);
    open();
    await screen.findByRole("region", { name: "Résumé de la demande" });
    for (const name of shown) expect(control(name), name).toBeInTheDocument();
    for (const name of hidden) expect(control(name), name).not.toBeInTheDocument();
  });

  it("shows no control at all, not a disabled one, when nothing can be done", async () => {
    serve({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: { actions: [] } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryAllByRole("link")).toHaveLength(0);
    expect(within(summary).getByText("Refusée : Effectif insuffisant")).toBeInTheDocument();
  });

  it("links the edit and change actions to their pages", async () => {
    serve({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } });
    open();
    expect(await screen.findByRole("link", { name: "Changer les dates" })).toHaveAttribute("href", "/me/requests/req-1/change?kind=change");
    expect(screen.getByRole("link", { name: "Annuler la demande" })).toHaveAttribute("href", "/me/requests/req-1/change?kind=cancel");
  });
});

describe("Request, my view: acting", () => {
  it("sends a draft from its page with its version", async () => {
    const calls = serve({ version: 4, status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.submit).toEqual([{ version: 4 }]));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("shows why a draft cannot be sent", async () => {
    serve({ status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } });
    server.use(
      http.post("/api/v1/requests/req-1/submit", () =>
        problemResponse(400, "validation", "Ces dates chevauchent une autre demande.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent une autre demande.", params: {} },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Ces dates chevauchent une autre demande.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/me/requests/req-1/edit");
  });

  it("withdraws with an undo and returns to the list", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la demande" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests");
    expect(toast).toHaveBeenCalledWith("Demande retirée.", expect.objectContaining({ undo: expect.any(Function) }));
    expect(calls.withdraw).toBe(0);
    await waitFor(() => expect(calls.withdraw).toBe(1));
  });

  it("a withdrawal that arrives too late says so", async () => {
    serve();
    server.use(
      http.post("/api/v1/requests/req-1/withdraw", () => problemResponse(409, "request.already_processed", "Déjà traitée.")),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la demande" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Trop tard : la demande avait déjà été traitée. Voici son état actuel."),
    );
  });

  it("adds the certificate from a sheet", async () => {
    const calls = serve({
      type: { code: "sick", name: "Congé maladie" },
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach", "withdraw"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter le certificat" }));
    const sheet = screen.getByRole("dialog", { name: "Ajouter le certificat" });
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(calls.uploads).toBe(1));
    expect(toast).toHaveBeenCalledWith("Fichier ajouté.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ajouter le certificat" })).not.toBeInTheDocument());
  });

  it("refuses a wrong file in the sheet without sending it", async () => {
    const calls = serve({
      type: { code: "sick", name: "Congé maladie" },
      certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter le certificat" }));
    const sheet = screen.getByRole("dialog", { name: "Ajouter le certificat" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    expect(await within(sheet).findByText("Choisissez un fichier.")).toBeInTheDocument();
    await pickFile("Certificat médical", new File(["notes"], "notes.txt", { type: "text/plain" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    expect(
      await within(sheet).findByText("Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG."),
    ).toBeInTheDocument();
    expect(calls.uploads).toBe(0);
  });

  it("withdraws an open change", async () => {
    const calls = serve({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: openChange,
      viewer: { actions: ["withdraw_amendment"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la modification" }));
    await waitFor(() => expect(calls.withdrawChange).toBe(1));
    expect(toast).toHaveBeenCalledWith("Modification retirée.");
  });
});

describe("Request, my view: one step away (M6)", () => {
  it("lists the steps with who decided, when, and their comment", async () => {
    serve({
      state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
      steps: [
        makeStep({ status: "approved", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Bon voyage", channel: "in_app" }),
        makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(await screen.findByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00)")).toBeInTheDocument();
    expect(screen.getByText("« Bon voyage »")).toBeInTheDocument();
    expect(screen.getByText("RH")).toBeInTheDocument();
    expect(screen.getByText("En attente de décision")).toBeInTheDocument();
  });

  it("says when a decision was given outside the application and who entered it", async () => {
    serve({
      steps: [
        makeStep({
          status: "approved",
          decided_by: "Sami Ben Ali",
          decided_at: "2026-10-29T10:00:00+01:00",
          recorded_by: "Leila Gharbi",
          channel: "paper",
        }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(
      await screen.findByText(
        "Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00) Décision saisie par Leila Gharbi, donnée sur papier.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the rounds apart after a request was sent back and sent again", async () => {
    serve({
      steps: [
        makeStep({ id: 1, round: 1, status: "returned", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Trop long" }),
        makeStep({ id: 3, round: 2, status: "pending" }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(await screen.findByText("Envoi n° 2")).toBeInTheDocument();
    expect(screen.getByText("Envoi n° 1")).toBeInTheDocument();
  });

  it("shows my comment and my files, each as a download", async () => {
    serve({
      comment: "Voyage en famille",
      attachments: [
        { public_id: "att-1", kind: "proof", name: "billet.pdf", size: 2048, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Mon commentaire et mes fichiers"));
    expect(await screen.findByText("Voyage en famille")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "billet.pdf" });
    expect(link).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
    expect(link).toHaveAttribute("download");
    expect(screen.getByText("Justificatif, ajouté par Amal Trabelsi le T(2026-10-28T10:00:00+01:00)")).toBeInTheDocument();
  });

  it("offers no comment-and-files block when there is neither", async () => {
    serve();
    open();
    await screen.findByText("Étapes");
    expect(screen.queryByText("Mon commentaire et mes fichiers")).not.toBeInTheDocument();
  });

  it("shows the changes I asked for and their outcome", async () => {
    serve({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendments: [
        {
          public_id: "am-0",
          kind: "change",
          status: "rejected",
          reason: "Vol décalé",
          new_start_date: "2026-11-16",
          new_end_date: "2026-11-18",
          new_quantity: "3.00",
          created_at: "2026-10-30T09:00:00+01:00",
          decided_at: "2026-10-31T09:00:00+01:00",
        },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Modifications demandées"));
    expect(await screen.findByText("Changement de dates · refusée")).toBeInTheDocument();
    expect(screen.getByText("Nouvelles dates : R(2026-11-16..2026-11-18) (3 j)")).toBeInTheDocument();
    expect(screen.getByText("Motif : Vol décalé")).toBeInTheDocument();
  });

  it("gives the full history", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByText("Historique complet"));
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
    expect(screen.getByText("T(2026-10-28T09:12:00+01:00) · Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("T(2026-10-29T08:00:00+01:00) · Système")).toBeInTheDocument();
  });
});
