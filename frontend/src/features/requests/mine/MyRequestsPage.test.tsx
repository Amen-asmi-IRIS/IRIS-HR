import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { chooseOption } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { RequestOut } from "../types";
import { clearPending, undoConfig } from "../undoable";
import MyRequestsPage from "./MyRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

const waiting = makeRequest();
const draft = makeRequest({
  public_id: "draft-1",
  status: "draft",
  start_date: "2026-12-01",
  end_date: "2026-12-02",
  quantity: "2.00",
  state: { key: "draft", waiting_on: [] },
  viewer: { actions: ["edit", "submit", "discard"] },
});
const remote = makeRequest({
  public_id: "req-2",
  type: { code: "remote", name: "Télétravail", calendar_label: "remote" },
  start_date: "2026-11-20",
  end_date: "2026-11-20",
  quantity: "1.00",
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { actions: ["amend"] },
});

function serve(rows: RequestOut[] = [waiting, draft, remote]) {
  const seen = { searches: [] as URLSearchParams[], deletes: [] as string[] };
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      seen.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(rows.filter((row) => !seen.deletes.includes(row.public_id))));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.delete("/api/v1/requests/:id", ({ params }) => {
      seen.deletes.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return seen;
}

const open = (route = "/me/requests") => renderApp(<MyRequestsPage />, { route, path: "/me/requests", me });

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("My space, Requests (UI 5.2)", () => {
  it("shows each request with its type, dates, length and where it stands", async () => {
    const seen = serve();
    open();
    expect(await screen.findByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(screen.getByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Pas encore envoyée")).toBeInTheDocument();
    expect(screen.getByText("D(2026-11-20)")).toBeInTheDocument();
    expect(screen.getByText("Approuvée")).toBeInTheDocument();
    expect(seen.searches[0].get("scope")).toBe("mine");
  });

  it("has one primary action, New request", async () => {
    serve();
    open();
    await screen.findByText("En attente de Sami Ben Ali");
    expect(screen.getByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
  });

  it("filters by status, type and year", async () => {
    const seen = serve();
    open();
    await screen.findByText("En attente de Sami Ben Ali");
    await screen.findByRole("option", { name: "Télétravail" });
    await chooseOption("Situation", "Approuvées");
    await chooseOption("Type", "Télétravail");
    await chooseOption("Année", "2026");
    await waitFor(() => {
      const last = seen.searches.at(-1);
      expect(last?.get("status")).toBe("approved");
      expect(last?.get("type")).toBe("remote");
      expect(last?.get("year")).toBe("2026");
    });
  });

  it("starts from the filters carried by the address", async () => {
    const seen = serve();
    open("/me/requests?status=draft");
    await screen.findByText("Pas encore envoyée");
    expect(seen.searches[0].get("status")).toBe("draft");
    expect(screen.getByLabelText("Situation")).toHaveValue("draft");
  });

  it("opens a request", async () => {
    serve();
    open();
    await screen.findByText("R(2026-11-09..2026-11-11)");
    // The first column is the button that opens the row.
    await userEvent.click(screen.getAllByRole("button", { name: "Congé annuel" })[0]);
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1");
  });

  it("offers to discard a draft only", async () => {
    serve();
    open();
    await screen.findByText("Pas encore envoyée");
    expect(screen.getAllByRole("button", { name: "Supprimer le brouillon" })).toHaveLength(1);
  });

  it("discards a draft: the row leaves at once, the server is told after the undo delay", async () => {
    const seen = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le brouillon" }));
    expect(screen.queryByText("R(2026-12-01..2026-12-02)")).not.toBeInTheDocument();
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Brouillon supprimé.", expect.objectContaining({ undo: expect.any(Function) }));
    expect(seen.deletes).toEqual([]);
    await waitFor(() => expect(seen.deletes).toEqual(["draft-1"]));
  });

  it("undo brings the draft back and nothing is deleted", async () => {
    const seen = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le brouillon" }));
    const options = vi.mocked(toast).mock.calls[0][1];
    act(() => options?.undo?.());
    expect(await screen.findByText("R(2026-12-01..2026-12-02)")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(seen.deletes).toEqual([]);
  });

  it("says why the list is empty", async () => {
    serve([]);
    open();
    expect(await screen.findByText("Aucune demande ici.")).toBeInTheDocument();
  });
});
