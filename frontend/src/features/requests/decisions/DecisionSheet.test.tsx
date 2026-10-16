import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeApprovalItem, makeRequestDetail, paginated, problemResponse, type RequestOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { useApprovals } from "../api";
import type { Decision } from "../types";
import { canSendBack, DecisionSheet, type DecisionTarget } from "./DecisionSheet";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

function Harness({ decision, request }: { decision: Decision; request?: RequestOverrides }) {
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  useApprovals({ queue: "mine" });
  const item = makeApprovalItem({ request: { version: 3, ...request } });
  return (
    <>
      <button onClick={() => setTarget({ request: item.request, stepId: item.step_id, decision })}>ouvrir</button>
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function serve() {
  const calls = { decide: [] as unknown[], queue: 0 };
  server.use(
    http.get("/api/v1/approvals", () => {
      calls.queue += 1;
      return HttpResponse.json(paginated([makeApprovalItem()]));
    }),
    http.post("/api/v1/steps/7/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" } }));
    }),
  );
  return calls;
}

async function openSheet(decision: Decision, title: string, request?: RequestOverrides) {
  renderApp(<Harness decision={decision} request={request} />, { route: "/team", me });
  await userEvent.click(screen.getByRole("button", { name: "ouvrir" }));
  return screen.findByRole("dialog", { name: title });
}

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Decision sheet (UI 6.2, REQ-05)", () => {
  it("approves with an optional comment, the version, and a stated consequence", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    expect(within(sheet).getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(within(sheet).getByText("Congé annuel · R(2026-11-09..2026-11-11) · 3 j")).toBeInTheDocument();
    expect(within(sheet).getByText("Votre accord est enregistré et la demande passe à l'étape suivante.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 3 }]));
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approuver la demande" })).not.toBeInTheDocument());
  });

  it("refreshes the queue once the decision is recorded", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    const before = calls.queue;
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.queue).toBeGreaterThan(before));
  });

  it("cannot refuse without a reason", async () => {
    const calls = serve();
    const sheet = await openSheet("reject", "Refuser la demande");
    expect(within(sheet).getByText("La demande est refusée et Amal Trabelsi en est informé. Cette décision est définitive.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    expect(await within(sheet).findByText("Indiquez le motif du refus : il est obligatoire.")).toBeInTheDocument();
    expect(calls.decide).toHaveLength(0);

    setText("Motif du refus", "  Effectif insuffisant cette semaine-là  ", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ decision: "reject", comment: "Effectif insuffisant cette semaine-là", version: 3 }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi refusée.");
  });

  it("cannot send back without saying what to correct", async () => {
    const calls = serve();
    const sheet = await openSheet("return", "Renvoyer la demande");
    await userEvent.click(within(sheet).getByRole("button", { name: "Renvoyer" }));
    expect(await within(sheet).findByText("Dites ce qu'il faut corriger : c'est obligatoire.")).toBeInTheDocument();
    expect(calls.decide).toHaveLength(0);
    setText("Ce qu'il faut corriger", "Décalez à la semaine suivante", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Renvoyer" }));
    await waitFor(() => expect(calls.decide).toHaveLength(1));
    expect(toast).toHaveBeenCalledWith("Demande renvoyée à Amal Trabelsi.");
  });

  it("a double click on Confirm posts one decision", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    await userEvent.dblClick(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(calls.decide).toHaveLength(1);
  });

  it("tells the approver when someone else decided first, and shows the current state", async () => {
    const calls = serve();
    server.use(
      http.post("/api/v1/steps/7/decide", () => problemResponse(409, "request.already_processed", "Déjà traitée.")),
    );
    const sheet = await openSheet("approve", "Approuver la demande");
    const before = calls.queue;
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."),
    );
    expect(toast).not.toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approuver la demande" })).not.toBeInTheDocument());
    await waitFor(() => expect(calls.queue).toBeGreaterThan(before));
  });

  it("shows a refusal of the server in the sheet and keeps the comment", async () => {
    serve();
    server.use(
      http.post("/api/v1/steps/7/decide", () =>
        problemResponse(400, "validation", "Le solde ne suffit plus : il manque 1 jour.", [
          { field: null, code: "request.balance_insufficient", detail: "Le solde ne suffit plus : il manque 1 jour.", params: {} },
        ]),
      ),
    );
    const sheet = await openSheet("approve", "Approuver la demande");
    setText("Commentaire (facultatif)", "Bon voyage", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    expect(await within(sheet).findByText("Le solde ne suffit plus : il manque 1 jour.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Commentaire (facultatif)")).toHaveValue("Bon voyage");
    expect(toast).not.toHaveBeenCalled();
  });

  it("states the consequence in HR's words when HR validates", async () => {
    serve();
    const sheet = await openSheet("approve", "Approuver la demande", { viewer: { relation: "hr", actions: ["decide"], step_id: 7 } });
    expect(
      within(sheet).getByText(
        "Votre validation est enregistrée. S'il ne reste aucune étape, la demande est approuvée et Amal Trabelsi en est informé.",
      ),
    ).toBeInTheDocument();
  });

  it("knows that a change to an approved request cannot be sent back", () => {
    const waiting = makeApprovalItem().request;
    const change = makeApprovalItem({
      request: {
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
      },
    }).request;
    expect(canSendBack(waiting)).toBe(true);
    expect(canSendBack(change)).toBe(false);
  });

  it("cancel closes the sheet without deciding", async () => {
    const calls = serve();
    const sheet = await openSheet("reject", "Refuser la demande");
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Refuser la demande" })).not.toBeInTheDocument());
    expect(calls.decide).toHaveLength(0);
  });
});
