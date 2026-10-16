import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ProblemError } from "@/api/problem";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import {
  makeApprovalItem, makePreview, makeRequest, makeRequestDetail, problemResponse, TYPES,
} from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { requestsApi } from "../../api";
import type { Preview, PreviewBody } from "../../types";
import { CorrectSheet } from "./CorrectSheet";
import { ManagerDelegateSheet } from "./ManagerDelegateSheet";
import { ReassignSheet } from "./ReassignSheet";
import { ReclassifySheet } from "./ReclassifySheet";
import { RecordOnBehalfSheet } from "./RecordOnBehalfSheet";

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
const CONCURRENT = "Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel.";

/** A request stuck with the manager, as HR sees it. */
const stuck = makeApprovalItem({
  request: { viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 } },
}).request;
const approved = makeRequest({
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null },
});
const sick = makeRequest({
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-09",
  end_date: "2026-11-10",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: 8 },
});

function Opened({ children }: { children: (open: boolean, setOpen: (open: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return <>{children(open, setOpen)}</>;
}

const show = (sheet: (open: boolean, setOpen: (open: boolean) => void) => ReactNode) =>
  renderApp(<Opened>{sheet}</Opened>, { route: "/hr", path: "/hr", me });

function serveRequester(manager: { public_id: string; name: string } | null = { public_id: "emp-mgr", name: "Sami Ben Ali" }) {
  server.use(
    http.get("/api/v1/employees/emp-owner", () => HttpResponse.json(makeEmployee({ public_id: "emp-owner", manager }))),
  );
}

function servePreview(preview: (body: PreviewBody) => Preview = () => makePreview()) {
  const bodies: PreviewBody[] = [];
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      bodies.push(body);
      return HttpResponse.json(preview(body));
    }),
  );
  return bodies;
}

const spies: MockInstance[] = [];

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
});

describe("Record a decision made outside the system (REQ-10)", () => {
  const TITLE = "Saisir une décision donnée hors de l'application";

  it("defaults to the requester's manager and records who, what, when, how and the note", async () => {
    serveRequester();
    const record = vi.spyOn(requestsApi, "recordOnBehalf").mockResolvedValue(makeRequestDetail());
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Cette étape attend : Sami Ben Ali")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
    await chooseOption("Comment", "Sur papier", within(sheet));
    setText("Note", "Signé sur le formulaire papier, remis à l'accueil", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        decided_by: "emp-mgr",
        decision: "approve",
        channel: "paper",
        note: "Signé sur le formulaire papier, remis à l'accueil",
        version: 1,
        scan: null,
        decided_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+01:00$/),
      }),
    );
    expect(toast).toHaveBeenCalledWith("Décision enregistrée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
  });

  it("cannot be confirmed without saying who decided, nor without a note", async () => {
    serveRequester(null);
    const record = vi.spyOn(requestsApi, "recordOnBehalf").mockResolvedValue(makeRequestDetail());
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    expect(await within(sheet).findByText("Indiquez qui a pris la décision.")).toBeInTheDocument();
    expect(
      within(sheet).getByText("La note est obligatoire : dites dans quelles circonstances la décision a été donnée."),
    ).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it("offers every outcome for a request, and no sending back for a change to an approved one", async () => {
    serveRequester();
    const change = makeRequest({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
      viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 9 },
    });
    const first = show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    let sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByRole("option", { name: "Renvoyée pour correction" })).toBeInTheDocument();
    first.unmount();
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={change} stepId={9} />);
    sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByRole("option", { name: "Approuvée" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("option", { name: "Renvoyée pour correction" })).not.toBeInTheDocument();
    // The step is that of the change: it names whom the change waits for, and defaults to the manager.
    expect(within(sheet).getByText("Cette étape attend : Sami Ben Ali")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
  });

  it("shows on who decided that the server does not accept that person for this step", async () => {
    serveRequester();
    server.use(
      http.post("/api/v1/steps/7/record-on-behalf", () =>
        problemResponse(400, "request.decided_by_not_approver", "Cette personne ne pouvait pas décider cette étape.", [
          { field: null, code: "request.decided_by_not_approver", detail: "Cette personne ne pouvait pas décider cette étape." },
        ]),
      ),
    );
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    setText("Qui a décidé", "emp-9", within(sheet));
    setText("Note", "Accord donné au téléphone", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    expect(await within(sheet).findByText("Cette personne ne pouvait pas décider cette étape.")).toBeInTheDocument();
    // On the person, not in the summary above the form.
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Note")).toHaveValue("Accord donné au téléphone");
  });

  it("says so and closes when someone else acted first", async () => {
    serveRequester();
    const record = vi
      .spyOn(requestsApi, "recordOnBehalf")
      .mockRejectedValue(new ProblemError({ status: 409, code: "request.already_processed", detail: "Déjà traitée." }));
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
    setText("Note", "Accord donné au téléphone", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(CONCURRENT));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
  });
});

describe("Give the step to someone else (REQ-13)", () => {
  const TITLE = "Confier l'étape à quelqu'un d'autre";

  function serveReassign() {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/steps/7/reassign", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail());
      }),
    );
    return bodies;
  }

  it("names the current approver and sends the new one with the reason", async () => {
    const bodies = serveReassign();
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Approbateur actuel : Sami Ben Ali")).toBeInTheDocument();
    setText("Nouvel approbateur", "emp-9", within(sheet));
    setText("Motif", "Sami est en déplacement jusqu'à la fin du mois", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    await waitFor(() =>
      expect(bodies).toEqual([{ new_approver: "emp-9", reason: "Sami est en déplacement jusqu'à la fin du mois" }]),
    );
    expect(toast).toHaveBeenCalledWith("Étape confiée à quelqu'un d'autre.");
  });

  it("needs a person and a reason", async () => {
    const bodies = serveReassign();
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    expect(await within(sheet).findByText("Choisissez la personne qui décidera.")).toBeInTheDocument();
    expect(within(sheet).getByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("shows on the person what the server refuses", async () => {
    server.use(
      http.post("/api/v1/steps/7/reassign", () =>
        problemResponse(400, "validation", "Cette personne n'a pas de compte.", [
          { field: "new_approver", code: "request.approver_without_account", detail: "Cette personne n'a pas de compte : elle ne pourrait pas décider." },
        ]),
      ),
    );
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    setText("Nouvel approbateur", "emp-9", within(sheet));
    setText("Motif", "Remplacement", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    expect(await within(sheet).findByText("Cette personne n'a pas de compte : elle ne pourrait pas décider.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Motif")).toHaveValue("Remplacement");
  });
});

describe("Correct, shorten or cancel (REQ-09)", () => {
  const TITLE = "Corriger ou annuler la demande";

  function serveCorrect() {
    const calls = { correct: [] as unknown[], cancel: [] as unknown[] };
    server.use(
      http.post("/api/v1/requests/req-1/correct", async ({ request }) => {
        calls.correct.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
      http.post("/api/v1/requests/req-1/cancel", async ({ request }) => {
        calls.cancel.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "cancelled" }));
      }),
    );
    return calls;
  }

  it("corrects the dates: shows the new count and its effect, says who will be told, sends dates and reason", async () => {
    const calls = serveCorrect();
    const previews = servePreview((body) => makePreview({ quantity: body.end_date === "2026-11-12" ? "4.00" : "3.00" }));
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Demande actuelle : R(2026-11-09..2026-11-11) (3 j)")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Corriger les dates")).toBeChecked();
    expect(within(sheet).getByText("Amal Trabelsi et son responsable en seront informés.")).toBeInTheDocument();
    setDate("Fin", "2026-11-12", within(sheet));
    expect(await within(sheet).findByText("4 j")).toBeInTheDocument();
    expect(within(sheet).getByText("Utilise 1 j de plus.")).toBeInTheDocument();
    expect(previews.at(-1)).toMatchObject({
      type: "annual",
      employee: "emp-owner",
      request: "req-1",
      end_date: "2026-11-12",
      override: true,
    });
    setText("Motif", "Retour décalé d'un jour, convenu avec le responsable", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    await waitFor(() =>
      expect(calls.correct).toEqual([
        {
          start_date: "2026-11-09",
          end_date: "2026-11-12",
          starts_at_midday: false,
          ends_at_midday: false,
          start_time: null,
          end_time: null,
          reason: "Retour décalé d'un jour, convenu avec le responsable",
        },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Demande corrigée.");
  });

  it("cannot be confirmed without a reason, nor with the dates it already has", async () => {
    const calls = serveCorrect();
    servePreview();
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(await within(sheet).findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(
      within(sheet).getByText("Ce sont les dates actuelles de la demande. Changez-les, ou choisissez l'annulation."),
    ).toBeInTheDocument();
    expect(calls.correct).toHaveLength(0);
  });

  it("refuses a single day flagged at both ends, next to the half-day choices", async () => {
    const calls = serveCorrect();
    servePreview();
    const oneDay = makeRequest({
      status: "approved",
      end_date: "2026-11-09",
      quantity: "1.00",
      state: { key: "approved", waiting_on: [] },
      viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null },
    });
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={oneDay} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    // The half-day choices appear once the type is known to allow them.
    await within(sheet).findByLabelText("Commencer à midi le premier jour");
    await toggle("Commencer à midi le premier jour", within(sheet));
    await toggle("Finir à midi le dernier jour", within(sheet));
    setText("Motif", "Demi-journée seulement", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(
      await within(sheet).findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.correct).toHaveLength(0);
  });

  it("cancels with a reason", async () => {
    const calls = serveCorrect();
    servePreview();
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByLabelText("Annuler la demande"));
    expect(within(sheet).queryByLabelText("Fin")).not.toBeInTheDocument();
    expect(await within(sheet).findByText("Les jours déjà déduits (3 j) sont rendus au solde.")).toBeInTheDocument();
    setText("Motif", "Mission annulée par le client", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler la demande" }));
    await waitFor(() => expect(calls.cancel).toEqual([{ reason: "Mission annulée par le client" }]));
    expect(toast).toHaveBeenCalledWith("Demande annulée.");
  });

  it("offers only what the API allows", async () => {
    serveCorrect();
    servePreview();
    const cancelOnly = makeRequest({ viewer: { relation: "hr", actions: ["cancel"], step_id: null } });
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={cancelOnly} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).queryByLabelText("Corriger les dates")).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Début")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Annuler la demande" })).toBeInTheDocument();
  });

  it("shows on its field what the server refuses, and keeps the reason", async () => {
    servePreview();
    server.use(
      http.post("/api/v1/requests/req-1/correct", () =>
        problemResponse(400, "validation", "Ces dates chevauchent son télétravail du 12 novembre.", [
          { field: null, code: "request.overlap", detail: "Ces dates chevauchent son télétravail du 12 novembre." },
        ]),
      ),
    );
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    setDate("Fin", "2026-11-12", within(sheet));
    setText("Motif", "Retour décalé", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(await within(sheet).findByText("Ces dates chevauchent son télétravail du 12 novembre.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Motif")).toHaveValue("Retour décalé");
  });
});

describe("Count sick leave as annual leave (PRD 6.5)", () => {
  const TITLE = "Compter l'arrêt en congé annuel";
  const short = { field: null, code: "request.balance_insufficient", detail: "Il manque 1,5 jour au solde.", params: { shortfall: 1.5 } };

  function serveReclassify() {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/requests/req-1/reclassify", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
    );
    return bodies;
  }

  it("states the consequence, shows the balance now and after, and reclassifies", async () => {
    const bodies = serveReclassify();
    const previews = servePreview(() => makePreview({ quantity: "2.00", balance: { now: "5.00", on_start: "5.00", after: "3.00" } }));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Jours concernés : R(2026-11-09..2026-11-10) (2 j)")).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "La demande devient un congé annuel, validé par les RH. Ces jours sont déduits du solde de Amal Trabelsi.",
      ),
    ).toBeInTheDocument();
    expect(await within(sheet).findByText("5 j")).toBeInTheDocument();
    expect(within(sheet).getByText("3 j")).toBeInTheDocument();
    expect(previews.at(-1)).toMatchObject({ type: "annual", employee: "emp-owner", request: "req-1", override: false });
    expect(within(sheet).queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    await waitFor(() => expect(bodies).toEqual([{}]));
    expect(toast).toHaveBeenCalledWith("Arrêt compté en congé annuel.");
  });

  it("asks for the reason of the exception when the balance does not cover the days", async () => {
    const bodies = serveReclassify();
    servePreview(() => makePreview({ quantity: "2.00", balance: { now: "0.50", on_start: "0.50", after: "-1.50" }, problems: [short] }));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(
      await within(sheet).findByText("Le solde ne couvre pas ces jours. Pour continuer, indiquez pourquoi une exception est accordée."),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    expect(await within(sheet).findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
    setText("Motif de l'exception", "Certificat jamais fourni, accord de la direction", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    await waitFor(() => expect(bodies).toEqual([{ override_reason: "Certificat jamais fourni, accord de la direction" }]));
  });

  it("asks for the reason when it is the server that finds the balance short", async () => {
    servePreview(() => makePreview({ quantity: "2.00", balance: null }));
    server.use(http.post("/api/v1/requests/req-1/reclassify", () => problemResponse(400, "validation", short.detail, [short])));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    expect(await within(sheet).findByLabelText("Motif de l'exception")).toBeInTheDocument();
    expect(within(sheet).getByText("Il manque 1,5 jour au solde.")).toBeInTheDocument();
  });

  it("ignores what the annual type would object to a leave already taken", async () => {
    servePreview(() =>
      makePreview({
        quantity: "2.00",
        problems: [{ field: "start_date", code: "request.past_dates", detail: "Les dates passées ne sont pas autorisées.", params: {} }],
      }),
    );
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await within(sheet).findByText("Jours concernés : R(2026-11-09..2026-11-10) (2 j)");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(sheet).queryByText("Les dates passées ne sont pas autorisées.")).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
  });
});

describe("Name a delegate for the manager a request is stuck with (UI 7.4)", () => {
  it("opens plan 02's delegation sheet for the requester's manager", async () => {
    serveRequester({ public_id: "emp-mgr", name: "Sami Ben Ali" });
    show((open, setOpen) => <ManagerDelegateSheet open={open} onOpenChange={setOpen} employeeId="emp-owner" />);
    expect(await screen.findByText("délégation pour Sami Ben Ali")).toBeInTheDocument();
  });

  it("opens nothing for someone who has no manager", async () => {
    serveRequester(null);
    show((open, setOpen) => <ManagerDelegateSheet open={open} onOpenChange={setOpen} employeeId="emp-owner" />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText(/délégation pour/)).not.toBeInTheDocument();
  });
});
