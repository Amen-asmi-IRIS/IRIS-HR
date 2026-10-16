import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestTypesPage from "./RequestTypesPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve() {
  const calls = { created: [] as Record<string, unknown>[], updated: [] as { id: string; body: Record<string, unknown> }[] };
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/request-types", async ({ request }) => {
      calls.created.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ ...TYPES.annual, id: 9, code: "formation" }, { status: 201 });
    }),
    http.patch("/api/v1/request-types/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json(TYPES.remote);
    }),
  );
  return calls;
}

const open = (readOnly = false) =>
  renderApp(<RequestTypesPage readOnly={readOnly} />, {
    route: "/hr/settings/request-types",
    path: "/hr/settings/request-types",
    me,
  });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, request types (UI 7.12, ADM-01)", () => {
  it("lists each type with what it counts, requires and limits", async () => {
    serve();
    open();
    const annual = await rowOf(/Congé annuel/);
    expect(annual.getByText("Jours")).toBeInTheDocument();
    expect(annual.getByText("Oui")).toBeInTheDocument();
    expect(annual.getByText("Aucune")).toBeInTheDocument();
    expect(annual.getByText("Actif")).toBeInTheDocument();
    expect((await rowOf(/Congé maladie/)).getByText("Requis")).toBeInTheDocument();
    expect((await rowOf(/Autorisation de sortie/)).getByText("Heures")).toBeInTheDocument();
    expect((await rowOf(/Télétravail/)).getByText("2 j par semaine")).toBeInTheDocument();
    // In the order HR gave them.
    const table = screen.getByRole("table", { name: "Types de demande" });
    expect(within(table).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Congé annuel",
      "Congé maladie",
      "Congé exceptionnel",
      "Autorisation de sortie",
      "Télétravail",
    ]);
  });

  it("says that a change applies to requests sent afterwards", async () => {
    serve();
    open();
    expect(
      await screen.findByText(
        "Une modification s'applique aux demandes envoyées ensuite ; les demandes déjà envoyées ne changent pas.",
      ),
    ).toBeInTheDocument();
  });

  it("changes a type without sending its code or its unit again", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Télétravail" }));
    const sheet = await screen.findByRole("dialog", { name: "Modifier : Télétravail" });
    expect(within(sheet).queryByLabelText("Code")).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Nom en français")).toHaveValue("Télétravail");
    expect(within(sheet).getByLabelText("Quantité maximale par période")).toHaveValue("2");
    expect(within(sheet).getByRole("link", { name: "Voir les étapes de ce type" })).toHaveAttribute(
      "href",
      "/hr/settings/steps?type=5",
    );
    setText("Quantité maximale par période", "3", within(sheet));
    await toggle("Proposé aux employés", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(calls.updated).toHaveLength(1));
    expect(calls.updated[0].id).toBe("5");
    expect(calls.updated[0].body).toMatchObject({
      name_fr: "Télétravail",
      name_en: "Remote work",
      cap_period: "week",
      cap_quantity: "3",
      is_active: false,
      balance_effect: "none",
    });
    expect(calls.updated[0].body).not.toHaveProperty("code");
    expect(calls.updated[0].body).not.toHaveProperty("unit");
    expect(toast).toHaveBeenCalledWith("Type enregistré.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Modifier : Télétravail" })).not.toBeInTheDocument());
  });

  it("creates a type, with its code and unit, and only the fields that apply", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const sheet = await screen.findByRole("dialog", { name: "Nouveau type de demande" });
    const inSheet = within(sheet);
    // A document deadline is asked only when a document is required, a quantity only with a period (M7).
    expect(inSheet.queryByLabelText("Délai pour le fournir (heures) (facultatif)")).not.toBeInTheDocument();
    expect(inSheet.queryByLabelText("Quantité maximale par période")).not.toBeInTheDocument();
    expect(inSheet.getByLabelText("Demi-journées autorisées")).toBeInTheDocument();

    setText("Code", "formation", inSheet);
    setText("Nom en français", "Formation", inSheet);
    setText("Nom en anglais", "Training", inSheet);
    setText("Description en français", "Une journée de formation.", inSheet);
    setText("Description en anglais", "A training day.", inSheet);
    await chooseOption("Compté en", "Heures", inSheet);
    expect(inSheet.queryByLabelText("Demi-journées autorisées")).not.toBeInTheDocument();
    await toggle("Un document est requis", inSheet);
    setText("Délai pour le fournir (heures) (facultatif)", "72", inSheet);
    await chooseOption("Limite", "Par mois", inSheet);
    setText("Quantité maximale par période", "8", inSheet);
    await chooseOption("Sur le calendrier des collègues", "Non affiché", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(calls.created).toHaveLength(1));
    expect(calls.created[0]).toEqual({
      code: "formation",
      name_fr: "Formation",
      name_en: "Training",
      description_fr: "Une journée de formation.",
      description_en: "A training day.",
      unit: "hour",
      allows_half_day: false,
      balance_effect: "none",
      document_rule: "required_within_deadline",
      document_deadline_hours: 72,
      allows_past_dates: false,
      notice_days: 0,
      cap_quantity: "8",
      cap_period: "month",
      reduces_meal_tickets: false,
      calendar_label: "hidden",
      is_sensitive: false,
      uses_events: false,
      is_active: true,
      sort_order: 100,
    });
  });

  it("refuses what cannot be right before anything is sent, on the field concerned", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau type de demande" }));
    setText("Préavis (jours)", "deux", inSheet);
    await chooseOption("Limite", "Par semaine", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(3);
    expect(inSheet.getByText("Saisissez un nombre entier, zéro ou plus.")).toBeInTheDocument();
    expect(inSheet.getByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();
    expect(calls.created).toHaveLength(0);
  });

  it("shows what the server refuses on its field and keeps what was typed", async () => {
    serve();
    server.use(
      http.post("/api/v1/request-types", () =>
        problemResponse(400, "validation", "Un autre type de demande utilise déjà ce code.", [
          { field: "code", code: "request.type_code_taken", detail: "Un autre type de demande utilise déjà ce code. Choisissez un code différent." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau type de demande" }));
    setText("Code", "annual", inSheet);
    setText("Nom en français", "Autre congé", inSheet);
    setText("Nom en anglais", "Other leave", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(
      await inSheet.findByText("Un autre type de demande utilise déjà ce code. Choisissez un code différent."),
    ).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Autre congé");
  });

  it("read-only: no action, and the attributes of a type can still be read", async () => {
    serve();
    open(true);
    await rowOf(/Congé maladie/);
    expect(screen.queryByRole("button", { name: "Nouveau type" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Une modification s'applique/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé maladie" }));
    const sheet = await screen.findByRole("dialog", { name: "Congé maladie" });
    expect(within(sheet).getByText("Commentaire et fichiers réservés aux RH")).toBeInTheDocument();
    expect(within(sheet).getByText("Sick leave")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("switch")).not.toBeInTheDocument();
  });
});
