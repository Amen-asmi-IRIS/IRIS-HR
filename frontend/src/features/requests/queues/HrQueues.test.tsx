import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import { makeApprovalItem, makePreview, makeRequestDetail, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ApprovalItem } from "../types";
import CertificatesPage from "./CertificatesPage";
import { overdueBy } from "./QueueTable";
import StuckPage from "./StuckPage";
import ToValidatePage from "./ToValidatePage";

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
const hours = (count: number) => new Date(Date.now() + count * 3_600_000).toISOString();
const LATE = hours(-50);
const SOON = hours(20);

/** A leave the manager approved, now waiting for HR. */
const leave = makeApprovalItem({
  step_id: 8,
  request: {
    state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
    viewer: { relation: "hr", actions: ["decide", "attach", "correct", "cancel"], step_id: 8 },
  },
});
const sickLate = makeApprovalItem({
  step_id: 21,
  request: {
    public_id: "req-5",
    employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
    type: { code: "sick", name: "Congé maladie" },
    start_date: "2026-11-02",
    end_date: "2026-11-03",
    quantity: "2.00",
    state: { key: "waiting_hr", waiting_on: [], last_actor: null },
    certificate: { status: "overdue", due_at: LATE },
    viewer: { relation: "hr", actions: ["decide", "attach", "reclassify", "correct", "cancel"], step_id: 21 },
  },
});
const sickSoon = makeApprovalItem({
  step_id: 22,
  request: {
    public_id: "req-6",
    employee: { public_id: "emp-6", name: "Ines Haddad" },
    type: { code: "sick", name: "Congé maladie" },
    start_date: "2026-11-05",
    end_date: "2026-11-05",
    quantity: "1.00",
    state: { key: "waiting_hr", waiting_on: [], last_actor: null },
    certificate: { status: "due", due_at: SOON },
    viewer: { relation: "hr", actions: ["decide", "attach"], step_id: 22 },
  },
});
const stuck = makeApprovalItem({
  step_id: 30,
  waiting_since: "2026-10-20T09:00:00+01:00",
  request: {
    public_id: "req-7",
    employee: { public_id: "emp-9", name: "Youssef Ayari", department: "Sinistres" },
    state: { key: "waiting_manager", waiting_on: ["Hatem Jlassi", "Nadia Karoui"] },
    viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 30 },
  },
});

function serve(items: ApprovalItem[]) {
  const calls = { searches: [] as URLSearchParams[], decide: [] as { step: string; body: unknown }[], uploads: [] as string[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      calls.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(items));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () =>
      HttpResponse.json([
        { id: 3, name: "Souscription" },
        { id: 4, name: "Sinistres" },
      ]),
    ),
    http.post("/api/v1/steps/:id/decide", async ({ request, params }) => {
      calls.decide.push({ step: String(params.id), body: await request.json() });
      return HttpResponse.json(makeRequestDetail({ status: "approved" }));
    }),
    http.post("/api/v1/requests/:id/attachments", ({ params }) => {
      calls.uploads.push(String(params.id));
      return HttpResponse.json(
        { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Leila Gharbi", uploaded_at: "2026-11-04T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post("/api/v1/requests/preview", () => HttpResponse.json(makePreview({ quantity: "2.00" }))),
    http.get("/api/v1/employees/:id", ({ params }) =>
      HttpResponse.json(makeEmployee({ public_id: String(params.id), manager: { public_id: "emp-mgr", name: "Hatem Jlassi" } })),
    ),
  );
  return calls;
}

const openValidate = (route = "/hr/validate") => renderApp(<ToValidatePage />, { route, path: "/hr/validate", me });
const openCertificates = () => renderApp(<CertificatesPage />, { route: "/hr/certificates", path: "/hr/certificates", me });
const openStuck = () => renderApp(<StuckPage />, { route: "/hr/stuck", path: "/hr/stuck", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("HR desk, To validate (UI 7.2)", () => {
  it("lists who, department, type, dates, length and where the document stands", async () => {
    const calls = serve([leave, sickLate]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    expect(row.getByText("Souscription")).toBeInTheDocument();
    expect(row.getByText("Congé annuel")).toBeInTheDocument();
    expect(row.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(row.getByText("3 j")).toBeInTheDocument();
    expect(row.getByText("Aucun document requis")).toBeInTheDocument();
    const late = await rowOf(/Karim Mansour/);
    expect(late.getByText(`En retard, attendu le T(${LATE})`)).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("hr");
    expect(calls.searches[0].get("page_size")).toBe("100");
  });

  it("filters by type and department on the server, by document status on the page", async () => {
    const calls = serve([leave, sickLate, sickSoon]);
    openValidate();
    await rowOf(/Amal Trabelsi/);
    await screen.findByRole("option", { name: "Congé maladie" });
    await screen.findByRole("option", { name: "Sinistres" });
    await chooseOption("Type", "Congé maladie");
    await chooseOption("Département", "Sinistres");
    await waitFor(() => {
      expect(calls.searches.at(-1)?.get("type")).toBe("sick");
      expect(calls.searches.at(-1)?.get("department")).toBe("4");
    });
    await chooseOption("Document", "En retard");
    expect(await screen.findByRole("row", { name: /Karim Mansour/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Ines Haddad/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Amal Trabelsi/ })).not.toBeInTheDocument();
    expect(calls.searches.at(-1)?.has("document")).toBe(false);
  });

  it("approves from the list, stating what HR's validation does", async () => {
    const calls = serve([leave]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    await userEvent.click(row.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    expect(
      within(sheet).getByText(
        "Votre validation est enregistrée. S'il ne reste aucune étape, la demande est approuvée et Amal Trabelsi en est informé.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ step: "8", body: { decision: "approve", comment: "", version: 1 } }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
  });

  it("offers to send back, except for a change to an approved request", async () => {
    const change = makeApprovalItem({
      step_id: 9,
      request: {
        public_id: "req-2",
        employee: { public_id: "emp-2", name: "Nour Chaabane" },
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_hr", waiting_on: [] },
        viewer: { relation: "hr", actions: ["decide"], step_id: 9 },
      },
    });
    serve([leave, change]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    expect(row.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
    const changeRow = await rowOf(/Nour Chaabane/);
    expect(changeRow.getByText("Changement de dates")).toBeInTheDocument();
    expect(changeRow.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(changeRow.queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("opens the request on the HR desk", async () => {
    serve([leave]);
    openValidate();
    await userEvent.click(await screen.findByRole("button", { name: "Amal Trabelsi" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });

  it("says when nothing waits, and when the filters leave nothing", async () => {
    serve([]);
    const first = openValidate();
    expect(await screen.findByText("Aucune demande n'attend la validation des RH.")).toBeInTheDocument();
    expect(screen.queryByText("Changez les filtres pour en voir d'autres.")).not.toBeInTheDocument();
    first.unmount();
    openValidate("/hr/validate?document=overdue");
    expect(await screen.findByText("Changez les filtres pour en voir d'autres.")).toBeInTheDocument();
  });
});

describe("HR desk, Certificates (UI 7.3)", () => {
  it("lists each sick leave without its certificate: who, dates, due date, overdue by", async () => {
    const calls = serve([sickLate, sickSoon]);
    openCertificates();
    const late = await rowOf(/Karim Mansour/);
    expect(late.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(late.getByText(`T(${LATE})`)).toBeInTheDocument();
    expect(late.getByText("2 j")).toBeInTheDocument();
    const soon = await rowOf(/Ines Haddad/);
    expect(soon.getByText(`T(${SOON})`)).toBeInTheDocument();
    expect(soon.getByText("Dans les délais")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("certificates");
  });

  it("attaches the certificate for the employee", async () => {
    const calls = serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Ajouter le certificat" }));
    const sheet = await screen.findByRole("dialog", { name: "Ajouter le certificat de Karim Mansour" });
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(calls.uploads).toEqual(["req-5"]));
    expect(toast).toHaveBeenCalledWith("Fichier ajouté.");
  });

  it("opens the sheet that counts the leave as annual leave", async () => {
    serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Compter en congé annuel" }));
    const sheet = await screen.findByRole("dialog", { name: "Compter l'arrêt en congé annuel" });
    expect(within(sheet).getByText("Jours concernés : R(2026-11-02..2026-11-03) (2 j)")).toBeInTheDocument();
  });

  it("refuses with a reason", async () => {
    const calls = serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Refuser" }));
    const sheet = await screen.findByRole("dialog", { name: "Refuser la demande" });
    setText("Motif du refus", "Certificat jamais reçu", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([
        { step: "21", body: { decision: "reject", comment: "Certificat jamais reçu", version: 1 } },
      ]),
    );
  });

  it("offers only what the API allows on each row", async () => {
    serve([sickLate, sickSoon]);
    openCertificates();
    const soon = await rowOf(/Ines Haddad/);
    expect(soon.getByRole("button", { name: "Ajouter le certificat" })).toBeInTheDocument();
    expect(soon.queryByRole("button", { name: "Compter en congé annuel" })).not.toBeInTheDocument();
  });
});

describe("HR desk, Stuck with a manager (UI 7.4)", () => {
  it("lists who, type, dates, whom it waits for and since when", async () => {
    const calls = serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    expect(row.getByText("Congé annuel")).toBeInTheDocument();
    expect(row.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(row.getByText("Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
    expect(row.getByText("D(2026-10-20T09:00:00+01:00)")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("stuck");
  });

  it("records the manager's decision from the row", async () => {
    serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Saisir la décision" }));
    const sheet = await screen.findByRole("dialog", { name: "Saisir une décision donnée hors de l'application" });
    expect(within(sheet).getByText("Cette étape attend : Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
  });

  it("gives the step to someone else from the row", async () => {
    serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Confier à quelqu'un d'autre" }));
    const sheet = await screen.findByRole("dialog", { name: "Confier l'étape à quelqu'un d'autre" });
    expect(within(sheet).getByText("Approbateur actuel : Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
  });

  it("names a delegate for the manager, on a manager's step only", async () => {
    const named = makeApprovalItem({
      step_id: 31,
      request: {
        public_id: "req-8",
        employee: { public_id: "emp-8", name: "Selim Gharsalli" },
        state: { key: "waiting_person", waiting_on: ["Rim Ben Salah"] },
        viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 31 },
      },
    });
    serve([stuck, named]);
    openStuck();
    const other = await rowOf(/Selim Gharsalli/);
    expect(other.queryByRole("button", { name: "Nommer un délégué" })).not.toBeInTheDocument();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Nommer un délégué" }));
    expect(await screen.findByText("délégation pour Hatem Jlassi")).toBeInTheDocument();
  });
});

describe("how long a certificate has been overdue", () => {
  const now = new Date("2026-11-10T12:00:00+01:00");

  it("counts hours under two days and whole days beyond", () => {
    expect(overdueBy("2026-11-10T09:30:00+01:00", now, "fr")).toBe("2 h");
    expect(overdueBy("2026-11-08T13:00:00+01:00", now, "fr")).toBe("47 h");
    expect(overdueBy("2026-11-07T09:00:00+01:00", now, "fr")).toBe("3 j");
  });

  it("is never negative", () => {
    expect(overdueBy("2026-11-11T09:00:00+01:00", now, "fr")).toBe("0 h");
  });
});
