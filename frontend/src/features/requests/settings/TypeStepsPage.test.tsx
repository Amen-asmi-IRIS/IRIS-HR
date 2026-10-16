import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ChainStepOut } from "../types";
import TypeStepsPage from "./TypeStepsPage";

vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const MANAGER_THEN_HR: ChainStepOut[] = [
  { id: 1, position: 1, approver_rule: "line_manager", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: 4 },
  { id: 2, position: 2, approver_rule: "hr_role", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: null },
];

function serve(steps: ChainStepOut[] = MANAGER_THEN_HR) {
  const calls = { asked: [] as string[], saved: [] as { id: string; body: unknown }[], previews: [] as string[] };
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/request-types/:id/steps", ({ params }) => {
      calls.asked.push(String(params.id));
      return HttpResponse.json(steps);
    }),
    http.put("/api/v1/request-types/:id/steps", async ({ request, params }) => {
      calls.saved.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(steps);
    }),
    http.get("/api/v1/request-types/:id/chain-preview", ({ request, params }) => {
      calls.previews.push(`${String(params.id)}:${new URL(request.url).searchParams.get("employee")}`);
      return HttpResponse.json([
        { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] },
        { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] },
      ]);
    }),
  );
  return calls;
}

const open = (route = "/hr/settings/steps", readOnly = false) =>
  renderApp(<TypeStepsPage readOnly={readOnly} />, { route, path: "/hr/settings/steps", me });
const step = async (n: number) => within(await screen.findByRole("group", { name: `Étape ${n}` }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, steps of a type (UI 7.12, ADM-02)", () => {
  it("shows the ordered steps of the first type: who acts, the role, the delays", async () => {
    const calls = serve();
    open();
    const first = await step(1);
    expect(first.getByLabelText("Qui agit")).toHaveValue("line_manager");
    expect(first.getByLabelText("Rôle")).toHaveValue("approve");
    expect(first.getByLabelText("Rappel après (jours ouvrés)")).toHaveValue("2");
    expect(first.getByLabelText("Alerte aux RH après (jours ouvrés) (facultatif)")).toHaveValue("4");
    const second = await step(2);
    expect(second.getByLabelText("Qui agit")).toHaveValue("hr_role");
    // HR is reminded, never alerted about itself.
    expect(second.queryByLabelText(/Alerte aux RH/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Type de demande")).toHaveValue("1");
    expect(calls.asked).toEqual(["1"]);
    expect(
      screen.getByText("Une modification s'applique aux demandes envoyées ensuite ; les demandes déjà envoyées ne changent pas."),
    ).toBeInTheDocument();
  });

  it("opens on the type the address names, and changes type from the list", async () => {
    const calls = serve();
    open("/hr/settings/steps?type=2");
    await step(1);
    expect(screen.getByLabelText("Type de demande")).toHaveValue("2");
    await chooseOption("Type de demande", "Télétravail");
    await waitFor(() => expect(calls.asked).toEqual(["2", "5"]));
    expect(screen.getByLabelText("Type de demande")).toHaveValue("5");
  });

  it("adds a step for a named person, moves it up, and saves the steps in their order", async () => {
    const calls = serve();
    open();
    await step(2);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    const added = await step(3);
    await chooseOption("Qui agit", "Une personne désignée", added);
    setText("Personne", "emp-9", added);
    setText("Rappel après (jours ouvrés)", "3", added);
    await userEvent.click(added.getByRole("button", { name: "Monter" }));
    expect((await step(2)).getByLabelText("Qui agit")).toHaveValue("named_person");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    await waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0]).toEqual({
      id: "1",
      body: {
        steps: [
          { approver_rule: "line_manager", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: 4 },
          { approver_rule: "named_person", named_person: "emp-9", mode: "approve", reminder_after_days: 3, flag_after_days: 4 },
          { approver_rule: "hr_role", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: null },
        ],
      },
    });
    expect(toast).toHaveBeenCalledWith("Étapes enregistrées.");
  });

  it("refuses steps of which none decides", async () => {
    const calls = serve();
    open();
    await chooseOption("Rôle", "Est seulement informé", await step(1));
    await chooseOption("Rôle", "Est seulement informé", await step(2));
    // A step that only informs has no delay to set.
    expect((await step(1)).queryByLabelText("Rappel après (jours ouvrés)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await screen.findByText("Au moins une étape doit décider.")).toBeInTheDocument();
    expect(calls.saved).toHaveLength(0);
  });

  it("refuses a named-person step without its person, and a delay that is not a number of days", async () => {
    const calls = serve();
    open();
    const first = await step(1);
    await chooseOption("Qui agit", "Une personne désignée", first);
    setText("Rappel après (jours ouvrés)", "0", first);
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await first.findByText("Choisissez la personne.")).toBeInTheDocument();
    expect(first.getByText("Saisissez un nombre entier de jours, entre 1 et 60.")).toBeInTheDocument();
    expect(calls.saved).toHaveLength(0);
  });

  it("removes a step, and offers no way up from the first nor down from the last", async () => {
    serve();
    open();
    const first = await step(1);
    expect(first.queryByRole("button", { name: "Monter" })).not.toBeInTheDocument();
    expect(first.getByRole("button", { name: "Descendre" })).toBeInTheDocument();
    expect((await step(2)).queryByRole("button", { name: "Descendre" })).not.toBeInTheDocument();
    await userEvent.click(first.getByRole("button", { name: "Retirer" }));
    expect((await step(1)).getByLabelText("Qui agit")).toHaveValue("hr_role");
    expect(screen.queryByRole("group", { name: "Étape 2" })).not.toBeInTheDocument();
  });

  it("previews the saved steps for a chosen employee", async () => {
    const calls = serve();
    open();
    await step(1);
    setText("Aperçu pour un employé", "emp-owner");
    expect(await screen.findByText("Son responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
    expect(calls.previews).toEqual(["1:emp-owner"]);
    expect(screen.getByText("L'aperçu montre les étapes enregistrées, pas vos modifications en cours.")).toBeInTheDocument();
  });

  it("shows what the server refuses, and keeps the steps as edited", async () => {
    serve();
    server.use(
      http.put("/api/v1/request-types/:id/steps", () =>
        problemResponse(400, "request.step_delay_invalid", "Les délais se comptent en jours ouvrés et doivent être d'au moins 1."),
      ),
    );
    open();
    setText("Rappel après (jours ouvrés)", "5", await step(1));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les délais se comptent en jours ouvrés et doivent être d'au moins 1.",
    );
    expect((await step(1)).getByLabelText("Rappel après (jours ouvrés)")).toHaveValue("5");
  });

  it("read-only: the steps as sentences, and nothing to change", async () => {
    serve();
    open("/hr/settings/steps?type=1", true);
    const list = await screen.findByRole("list", { name: "Étapes d'un type" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Le responsable · Décide");
    expect(items[0]).toHaveTextContent("Rappel après 2 jours ouvrés, alerte aux RH après 4 jours ouvrés");
    expect(items[1]).toHaveTextContent("Les RH · Décide");
    expect(screen.queryByRole("button", { name: "Enregistrer les étapes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une étape" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aperçu pour un employé")).not.toBeInTheDocument();
    expect(screen.queryByText(/Une modification s'applique/)).not.toBeInTheDocument();
  });
});
