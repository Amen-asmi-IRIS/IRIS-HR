import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import {
  makePreview, makeRequestDetail, makeStep, paginated, TYPES, type DetailOverrides,
} from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";
import { clearPending, undoConfig } from "../undoable";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
vi.mock("@/features/delegations/DelegationSheet", () => ({
  DelegationSheet: ({ open, manager }: { open: boolean; manager?: { name: string } }) =>
    open ? <p>délégation pour {manager?.name}</p> : null,
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

/** An annual leave the manager approved, waiting for HR. */
const toValidate: DetailOverrides = {
  comment: "Voyage en famille",
  state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
  viewer: { relation: "hr", actions: ["decide", "attach", "correct", "cancel"], step_id: 8 },
  steps: [
    makeStep({ status: "approved", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Bon voyage", channel: "in_app" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  decision_context: { balance: { now: "12.50", after: "9.50" }, teammates_away: [], cap: null },
};

/** A sick leave with its certificate: HR sees the comment and the file. */
const sickWithCertificate: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  comment: "Fièvre depuis hier",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "attached", due_at: "2026-11-11T09:00:00+01:00" },
  attachments: [
    { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 2048, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-11-09T18:00:00+01:00" },
  ],
  steps: [
    // The server stamps the moment the manager was informed, as it does a decision.
    makeStep({ mode: "notify", status: "notified", decided_at: "2026-11-09T08:00:00+01:00" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify", "correct", "cancel"], step_id: 8 },
};

/** A leave nobody decides: HR was alerted. */
const stuckWithManager: DetailOverrides = {
  viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 },
};

function serve(detail: DetailOverrides) {
  const calls = { decide: [] as unknown[], submit: [] as unknown[], discards: 0 };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", () => HttpResponse.json(makePreview())),
    http.get("/api/v1/employees/emp-owner", () =>
      HttpResponse.json(makeEmployee({ public_id: "emp-owner", manager: { public_id: "emp-mgr", name: "Sami Ben Ali" } })),
    ),
    http.post("/api/v1/steps/8/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ ...detail, status: "approved" }));
    }),
    http.post("/api/v1/requests/req-1/submit", async ({ request }) => {
      calls.submit.push(await request.json());
      return HttpResponse.json(makeRequestDetail());
    }),
    http.delete("/api/v1/requests/req-1", () => {
      calls.discards += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const open = () => renderApp(<RequestPage />, { route: "/hr/requests/req-1", path: "/hr/requests/:id", me });
const summary = async () => within(await screen.findByRole("region", { name: "Résumé de la demande" }));
const others = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Autres actions RH" }));
};

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("Request, HR view: shown first (UI 7.8)", () => {
  it("shows who asks, the comment, the earlier decision with its comment, and the balance now and after", async () => {
    serve(toValidate);
    open();
    const region = await summary();
    expect(region.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(region.getByText(/Souscription/)).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("À valider")).toBeInTheDocument();
    expect(region.getByText("Voyage en famille")).toBeInTheDocument();
    expect(region.getByText("Aucun document requis")).toBeInTheDocument();
    expect(region.getByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    expect(region.getByText("Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00)")).toBeInTheDocument();
    expect(region.getByText("« Bon voyage »")).toBeInTheDocument();
    expect(region.getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
  });

  it("shows the sick-leave comment and the certificate, which HR may see", async () => {
    serve(sickWithCertificate);
    open();
    const region = await summary();
    expect(region.getByText("Fièvre depuis hier")).toBeInTheDocument();
    expect(region.getByText("Document fourni")).toBeInTheDocument();
    expect(region.getByRole("link", { name: "certificat.pdf" })).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
    expect(region.getByText("Certificat médical, ajouté par Amal Trabelsi le T(2026-11-09T18:00:00+01:00)")).toBeInTheDocument();
    // The manager was only informed: there is no earlier decision to show.
    expect(region.queryByText(/Responsable/)).not.toBeInTheDocument();
    // The files are in the summary, not a second time one step away.
    expect(screen.queryByRole("button", { name: "Fichiers" })).not.toBeInTheDocument();
  });

  it("states an awaited certificate once, under Document", async () => {
    serve({ ...sickWithCertificate, certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" }, attachments: [] });
    open();
    const region = await summary();
    expect(region.getByText("À valider")).toBeInTheDocument();
    expect(region.getByText("À fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
    expect(region.queryByText(/^Certificat à fournir/)).not.toBeInTheDocument();
  });
});

describe("Request, HR view: deciding", () => {
  it("offers approve, refuse and send back, and stays on the request once decided", async () => {
    const calls = serve(toValidate);
    open();
    const region = await summary();
    expect(region.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(region.getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
    // HR changes a waiting request by a correction, never by editing it (plan 03a, at review).
    expect(region.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    await userEvent.click(region.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 1 }]));
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("approves or refuses a change, and never sends it back", async () => {
    serve({
      ...toValidate,
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_hr", waiting_on: [] },
    });
    open();
    const region = await summary();
    expect(region.getByText("Modification à décider")).toBeInTheDocument();
    expect(region.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(region.queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("shows no decision when it is not HR's turn", async () => {
    serve(stuckWithManager);
    open();
    const region = await summary();
    expect(region.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("Request, HR view: other HR actions, one step away", () => {
  it("offers exactly the actions the API allows", async () => {
    serve(stuckWithManager);
    open();
    await others();
    for (const name of [
      "Saisir une décision donnée hors de l'application",
      "Confier l'étape à quelqu'un d'autre",
      "Nommer un délégué pour le responsable",
      "Corriger ou annuler",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Compter en congé annuel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter un fichier" })).not.toBeInTheDocument();
  });

  it("has no such block once nothing can be done", async () => {
    serve({ status: "rejected", state: { key: "rejected", waiting_on: [], note: null }, viewer: { relation: "hr", actions: [], step_id: null } });
    open();
    await summary();
    expect(screen.queryByRole("button", { name: "Autres actions RH" })).not.toBeInTheDocument();
  });

  it.each([
    [stuckWithManager, "Saisir une décision donnée hors de l'application", "Saisir une décision donnée hors de l'application"],
    [stuckWithManager, "Confier l'étape à quelqu'un d'autre", "Confier l'étape à quelqu'un d'autre"],
    [stuckWithManager, "Corriger ou annuler", "Corriger ou annuler la demande"],
    [sickWithCertificate, "Compter en congé annuel", "Compter l'arrêt en congé annuel"],
    [sickWithCertificate, "Ajouter un fichier", "Ajouter un fichier pour Amal Trabelsi"],
  ] as const)("opens the sheet of an action (%#)", async (detail, action, title) => {
    serve(detail);
    open();
    await others();
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it("names a delegate for the manager a request is stuck with", async () => {
    serve(stuckWithManager);
    open();
    await others();
    await userEvent.click(screen.getByRole("button", { name: "Nommer un délégué pour le responsable" }));
    expect(await screen.findByText("délégation pour Sami Ben Ali")).toBeInTheDocument();
  });
});

describe("Request, HR view: a draft this HR holder prepared", () => {
  const draft: DetailOverrides = {
    version: 3,
    status: "draft",
    state: { key: "draft", waiting_on: [] },
    created_by_hr: true,
    viewer: { relation: "hr", actions: ["edit", "submit", "discard"], step_id: null },
  };

  it("can be sent, edited or discarded", async () => {
    const calls = serve(draft);
    open();
    const region = await summary();
    expect(region.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/requests/req-1/edit");
    expect(region.getByRole("button", { name: "Supprimer le brouillon" })).toBeInTheDocument();
    await userEvent.click(region.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.submit).toEqual([{ version: 3 }]));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("is discarded with an undo, from the list it returns to", async () => {
    const calls = serve(draft);
    open();
    const region = await summary();
    await userEvent.click(region.getByRole("button", { name: "Supprimer le brouillon" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests");
    expect(toast).toHaveBeenCalledWith("Brouillon supprimé.", expect.objectContaining({ undo: expect.any(Function) }));
    await waitFor(() => expect(calls.discards).toBe(1));
  });
});
