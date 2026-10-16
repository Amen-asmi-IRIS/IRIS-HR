import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeType, TYPES } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import NewRequestPage from "./NewRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const open = (route: string) => renderApp(<NewRequestPage />, { route, path: "/me/requests/new", me });

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("New request (UI 5.3)", () => {
  it("starts with the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new");
    expect(screen.getByRole("heading", { name: "Quel type de demande ?" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute("href", "/me/requests/new?type=annual");
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });

  it("keeps the day chosen on the calendar through the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new?date=2026-11-09");
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute(
      "href",
      "/me/requests/new?date=2026-11-09&type=annual",
    );
  });

  it("then shows the form of that type, with one primary action", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual&date=2026-11-09");
    expect(await screen.findByRole("heading", { name: "Congé annuel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-09");
    expect(screen.getAllByRole("button", { name: "Envoyer" })).toHaveLength(1);
  });

  it("is not available for a type that does not exist or is no longer offered", async () => {
    serveRequestForm({ types: [TYPES.annual, makeType("remote", { is_active: false })] });
    open("/me/requests/new?type=remote");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });

  it("goes to the request once sent and says so", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/new-1"));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("goes back to the list once saved for later", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer pour plus tard" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests"));
    expect(toast).toHaveBeenCalledWith("Brouillon enregistré.");
  });

  it("keeps the form and what was typed while the application is away", async () => {
    serveRequestForm();
    const { queryClient } = open("/me/requests/new?type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    // A later reading of the types (a return to the window) is not answered by the application.
    server.use(http.get("/api/v1/request-types", () => new HttpResponse("<html>Service unavailable</html>", { status: 503 })));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["request-config", "types"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(queryClient.getQueryState(["request-config", "types"])?.status).toBe("error");
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument();
  });

  it("goes back to the list on cancel", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests");
  });
});

describe("New request from a day of the calendar (UI 5.7)", () => {
  it("fills both dates from ?start=", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=2026-11-17");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-17");
  });

  it("takes the last day from ?end= when it is given", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=2026-11-17&end=2026-11-19");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-19");
  });

  it("keeps ?start= through the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new?start=2026-11-17");
    expect(await screen.findByRole("link", { name: /Télétravail/ })).toHaveAttribute(
      "href",
      "/me/requests/new?start=2026-11-17&type=remote",
    );
  });

  it("ignores a value that is not a date", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=demain&end=2026-13-45");
    expect(await screen.findByLabelText("Début")).toHaveValue("");
    expect(screen.getByLabelText("Fin")).toHaveValue("");
  });

  it("prefers the day chosen on the calendar to text kept from an earlier visit", async () => {
    serveRequestForm();
    const first = open("/me/requests/new?type=remote");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-12-01");
    setDate("Fin", "2026-12-01");
    first.unmount();

    open("/me/requests/new?type=remote&start=2026-11-17");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-17");
  });
});
