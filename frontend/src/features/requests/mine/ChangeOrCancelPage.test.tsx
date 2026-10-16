import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, makeRequestDetail, problemResponse, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { Preview, PreviewBody } from "../types";
import ChangeOrCancelPage from "./ChangeOrCancelPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const approved: DetailOverrides = {
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { actions: ["amend"] },
};

function serve(detail: DetailOverrides = approved, preview: (body: PreviewBody) => Preview = () => makePreview()) {
  const calls = { amendments: [] as unknown[], previews: [] as PreviewBody[] };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      calls.previews.push(body);
      return HttpResponse.json(preview(body));
    }),
    http.post("/api/v1/requests/req-1/amendments", async ({ request }) => {
      calls.amendments.push(await request.json());
      return HttpResponse.json(makeRequestDetail(detail), { status: 201 });
    }),
  );
  return calls;
}

const open = (search = "") =>
  renderApp(<ChangeOrCancelPage />, { route: `/me/requests/req-1/change${search}`, path: "/me/requests/:id/change", me });

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Change or cancel an approved request (UI 5.5)", () => {
  it("recalls the current request and states that it stays valid until the change is approved", async () => {
    serve();
    open();
    expect(await screen.findByText("Demande actuelle : R(2026-11-09..2026-11-11) (3 j)")).toBeInTheDocument();
    expect(screen.getByText("L'original reste valable tant que la modification n'est pas approuvée.")).toBeInTheDocument();
    expect(screen.getByLabelText("Changer les dates")).toBeChecked();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
  });

  it("shows the new count, the effect on the balance and who will decide, then sends the change", async () => {
    const calls = serve(approved, (body) => makePreview({ quantity: body.end_date === "2026-11-19" ? "4.00" : "3.00" }));
    open();
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-19");
    expect(await screen.findByText("4 j")).toBeInTheDocument();
    expect(screen.getByText("Utilise 1 j de plus.")).toBeInTheDocument();
    expect(screen.getByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();

    setText("Motif", "Vol décalé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.amendments).toEqual([
      {
        kind: "change",
        start_date: "2026-11-16",
        end_date: "2026-11-19",
        starts_at_midday: false,
        ends_at_midday: false,
        start_time: null,
        end_time: null,
        reason: "Vol décalé",
      },
    ]);
    expect(toast).toHaveBeenCalledWith("Modification envoyée.");
  });

  it("says when a shorter leave gives days back, and when nothing changes for the balance", async () => {
    serve(approved, (body) => makePreview({ quantity: body.end_date === "2026-11-10" ? "2.00" : "3.00" }));
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    expect(await screen.findByText("Rend 1 j.")).toBeInTheDocument();
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    expect(await screen.findByText("Aucun changement.")).toBeInTheDocument();
  });

  it("does not speak of the balance for a type that does not use it", async () => {
    serve({ ...approved, type: { code: "remote", name: "Télétravail", calendar_label: "remote" } });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    await screen.findByText("Votre responsable, Sami Ben Ali, puis les RH");
    expect(screen.queryByText("Effet sur votre solde")).not.toBeInTheDocument();
  });

  it("cannot be confirmed without a reason", async () => {
    const calls = serve();
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(await screen.findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });

  it("refuses to send dates that did not change", async () => {
    const calls = serve();
    open();
    await screen.findByLabelText("Début");
    setText("Motif", "Erreur");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(
      await screen.findByText("Ce sont les dates actuelles de la demande. Changez-les, ou choisissez l'annulation."),
    ).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });

  it("asks for a cancellation with a reason only", async () => {
    const calls = serve();
    open("?kind=cancel");
    expect(await screen.findByLabelText("Annuler la demande")).toBeChecked();
    expect(screen.queryByLabelText("Début")).not.toBeInTheDocument();
    expect(await screen.findByText("Une fois approuvée, l'annulation rend 3 j à votre solde.")).toBeInTheDocument();
    setText("Motif", "Voyage annulé");
    await userEvent.click(screen.getByRole("button", { name: "Demander l'annulation" }));
    await waitFor(() => expect(calls.amendments).toEqual([{ kind: "cancel", reason: "Voyage annulé" }]));
    expect(toast).toHaveBeenCalledWith("Annulation demandée.");
  });

  it("switches between the change and the cancellation", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByLabelText("Annuler la demande"));
    expect(screen.queryByLabelText("Début")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demander l'annulation" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Changer les dates"));
    expect(screen.getByLabelText("Début")).toBeInTheDocument();
  });

  it("asks for the preview with the request's own id, and shows what the server already objects to", async () => {
    const calls = serve(approved, () =>
      makePreview({
        problems: [{ field: null, code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} }],
      }),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(calls.previews.at(-1)).toMatchObject({ request: "req-1", type: "annual", end_date: "2026-11-12" });
  });

  it("shows on its field what the server refuses when the change is sent", async () => {
    serve();
    server.use(
      http.post("/api/v1/requests/req-1/amendments", () =>
        problemResponse(400, "validation", "Ces dates chevauchent votre télétravail du 17 novembre.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 17 novembre.", params: {} },
          { field: null, code: "request.amendment_open", detail: "Une modification est déjà en cours pour cette demande.", params: {} },
        ]),
      ),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    setText("Motif", "Vol décalé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 17 novembre.")).toBeInTheDocument();
    expect(screen.getByText("Une modification est déjà en cours pour cette demande.")).toBeInTheDocument();
    expect(screen.getByLabelText("Motif")).toHaveValue("Vol décalé");
  });

  it("changes the date and the times of a permission", async () => {
    const calls = serve({
      ...approved,
      type: { code: "permission", name: "Autorisation de sortie", unit: "hour", calendar_label: "hidden" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:00:00",
      quantity: "2.00",
    });
    open();
    expect(await screen.findByLabelText("De")).toHaveValue("14:00");
    expect(screen.queryByLabelText("Fin")).not.toBeInTheDocument();
    setTime("À", "17:00");
    setText("Motif", "Rendez-vous plus long");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    await waitFor(() => expect(calls.amendments).toHaveLength(1));
    expect(calls.amendments[0]).toMatchObject({
      kind: "change",
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      start_time: "14:00",
      end_time: "17:00",
    });
  });

  it("goes back to the request when it can no longer be changed", async () => {
    serve({ ...approved, viewer: { actions: [] } });
    open();
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
  });

  it("refuses a single day flagged at both ends, next to the half-day choices", async () => {
    const calls = serve({ ...approved, end_date: "2026-11-09", quantity: "1.00" });
    open();
    // The half-day choices appear once the type is known to allow them.
    await screen.findByLabelText("Commencer à midi le premier jour");
    await toggle("Commencer à midi le premier jour");
    await toggle("Finir à midi le dernier jour");
    setText("Motif", "Rendez-vous déplacé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(
      await screen.findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });
});
