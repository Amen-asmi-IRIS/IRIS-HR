import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEvent, problemResponse } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import EventsPage from "./EventsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve() {
  const calls = { created: [] as unknown[], updated: [] as { id: string; body: unknown }[] };
  server.use(
    http.get("/api/v1/exceptional-events", () =>
      HttpResponse.json([
        makeEvent(),
        makeEvent({ id: 2, name: "Pèlerinage", name_fr: "Pèlerinage", name_en: "Pilgrimage", days_allowed: "10.00", proof_required: false, is_active: false }),
      ]),
    ),
    http.post("/api/v1/exceptional-events", async ({ request }) => {
      calls.created.push(await request.json());
      return HttpResponse.json(makeEvent({ id: 3 }), { status: 201 });
    }),
    http.patch("/api/v1/exceptional-events/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(makeEvent());
    }),
  );
  return calls;
}

const open = (readOnly = false) =>
  renderApp(<EventsPage readOnly={readOnly} />, { route: "/hr/settings/events", path: "/hr/settings/events", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, exceptional-leave events (UI 7.12, ADM-03)", () => {
  it("lists each event with the days it gives, whether proof is required, and its state", async () => {
    serve();
    open();
    const marriage = await rowOf(/Mariage/);
    expect(marriage.getByText("3 j")).toBeInTheDocument();
    expect(marriage.getByText("Oui")).toBeInTheDocument();
    expect(marriage.getByText("Actif")).toBeInTheDocument();
    const pilgrimage = await rowOf(/Pèlerinage/);
    expect(pilgrimage.getByText("10 j")).toBeInTheDocument();
    expect(pilgrimage.getByText("Non")).toBeInTheDocument();
    expect(pilgrimage.getByText("Inactif")).toBeInTheDocument();
  });

  it("creates an event", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouvel événement" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouvel événement" }));
    setText("Nom en français", "Déménagement", inSheet);
    setText("Nom en anglais", "Moving house", inSheet);
    setText("Jours accordés", "1", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.created).toEqual([
        { name_fr: "Déménagement", name_en: "Moving house", days_allowed: "1", proof_required: false, is_active: true },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Événement enregistré.");
  });

  it("changes an event", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Mariage" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Modifier : Mariage" }));
    expect(inSheet.getByLabelText("Jours accordés")).toHaveValue("3");
    setText("Jours accordés", "4", inSheet);
    await toggle("Un justificatif est requis", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.updated).toEqual([
        { id: "1", body: { name_fr: "Mariage", name_en: "Marriage", days_allowed: "4", proof_required: false, is_active: true } },
      ]),
    );
  });

  it("refuses missing names and zero days before sending, and shows the server's refusal on its field", async () => {
    const calls = serve();
    server.use(
      http.post("/api/v1/exceptional-events", () =>
        problemResponse(400, "validation", "Le nombre de jours accordés doit être supérieur à zéro.", [
          { field: "days_allowed", code: "request.event_days_invalid", detail: "Le nombre de jours accordés doit être supérieur à zéro." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouvel événement" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouvel événement" }));
    setText("Jours accordés", "0", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(2);
    expect(inSheet.getByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();
    expect(calls.created).toHaveLength(0);

    setText("Nom en français", "Déménagement", inSheet);
    setText("Nom en anglais", "Moving house", inSheet);
    setText("Jours accordés", "0,5", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findByText("Le nombre de jours accordés doit être supérieur à zéro.")).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Déménagement");
  });

  it("read-only: the list, and nothing to open or add", async () => {
    serve();
    open(true);
    await rowOf(/Mariage/);
    expect(screen.queryByRole("button", { name: "Nouvel événement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mariage" })).not.toBeInTheDocument();
  });
});
