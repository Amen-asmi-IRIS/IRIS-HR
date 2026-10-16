import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, problemResponse, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import EditRequestPage from "./EditRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const open = () => renderApp(<EditRequestPage />, { route: "/me/requests/req-1/edit", path: "/me/requests/:id/edit", me });

const draft: DetailOverrides = { public_id: "req-1", comment: "Voyage" };
const returned: DetailOverrides = {
  public_id: "req-1",
  status: "returned",
  state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Décalez à la semaine suivante" },
  viewer: { actions: ["edit", "submit", "withdraw"] },
};
const pending: DetailOverrides = {
  public_id: "req-1",
  status: "pending",
  state: { key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
  viewer: { actions: ["edit", "withdraw"] },
  submitted_at: "2026-10-28T09:12:00+01:00",
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("Editing a request (UI 5.3)", () => {
  it("opens a draft with its values and sends it", async () => {
    const calls = serveRequestForm({ draft });
    open();
    expect(await screen.findByRole("heading", { name: "Modifier : Congé annuel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage");

    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.create).toHaveLength(0);
    expect(calls.update[0]).toMatchObject({ version: 1, end_date: "2026-11-12", comment: "Voyage" });
    expect(calls.submit).toEqual([{ version: 2 }]);
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("shows who sent the request back and why, and sends it again", async () => {
    const calls = serveRequestForm({ draft: returned });
    open();
    expect(await screen.findByText("Renvoyée par Sami Ben Ali : Décalez à la semaine suivante")).toBeInTheDocument();
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    await userEvent.click(screen.getByRole("button", { name: "Renvoyer" }));
    await waitFor(() => expect(calls.submit).toHaveLength(1));
    expect(calls.update[0]).toMatchObject({ start_date: "2026-11-16", end_date: "2026-11-18" });
  });

  it("saves the changes of a pending request without submitting it again", async () => {
    const calls = serveRequestForm({ draft: pending });
    open();
    await screen.findByLabelText("Début");
    expect(screen.queryByRole("button", { name: "Enregistrer pour plus tard" })).not.toBeInTheDocument();
    setDate("Fin", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.update).toHaveLength(1);
    expect(calls.submit).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith("Modifications enregistrées.");
  });

  it("asks for the preview with the request's own id, so that it does not collide with itself", async () => {
    const calls = serveRequestForm({ draft: pending });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ request: "req-1", end_date: "2026-11-10" }));
    expect(await screen.findByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
  });

  it("shows a problem of the preview on its field, as for a new request", async () => {
    serveRequestForm({
      draft: pending,
      preview: makePreview({
        problems: [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 12 novembre.", params: {} },
        ],
      }),
    });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 12 novembre.")).toBeInTheDocument();
  });

  it("still shows what the server refuses when the changes are saved", async () => {
    serveRequestForm({ draft: pending });
    server.use(
      http.patch("/api/v1/requests/req-1", () =>
        problemResponse(400, "validation", "Ces dates chevauchent votre télétravail du 12 novembre.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 12 novembre.", params: {} },
        ]),
      ),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 12 novembre.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-12");
  });

  it("goes back to the request when it can no longer be edited", async () => {
    serveRequestForm({ draft: { ...pending, viewer: { actions: ["withdraw"] } } });
    open();
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
  });

  it("says so when the kind of request no longer exists", async () => {
    serveRequestForm({ draft, types: [TYPES.sick] });
    open();
    expect(await screen.findByText("Ce type de demande n'existe plus.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revenir à la demande" })).toHaveAttribute("href", "/me/requests/req-1");
  });

  it("is not available for a request outside the viewer's reach", async () => {
    serveRequestForm({ draft });
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    open();
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});
