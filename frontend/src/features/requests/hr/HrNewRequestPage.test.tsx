import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { setDate, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import HrNewRequestPage from "./HrNewRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const open = (route: string) => renderApp(<HrNewRequestPage />, { route, path: "/hr/requests/new", me });

function serve(options: Parameters<typeof serveRequestForm>[0] = {}) {
  const calls = serveRequestForm(options);
  server.use(
    http.get("/api/v1/employees/emp-owner", () =>
      HttpResponse.json(makeEmployee({ public_id: "emp-owner", name: "Amal Trabelsi" })),
    ),
  );
  return calls;
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("New request for an employee (UI 7.7)", () => {
  it("starts with the choice of the employee, then of the type", async () => {
    serve();
    open("/hr/requests/new");
    expect(screen.getByRole("heading", { name: "Nouvelle demande pour un employé" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Congé annuel/ })).not.toBeInTheDocument();
    setText("Employé", "emp-owner");
    expect(await screen.findByRole("heading", { name: "Nouvelle demande pour Amal Trabelsi" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-owner&type=annual",
    );
  });

  it("opens on the employee the address carries, as when it comes from the employee's record", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner");
    expect(await screen.findByRole("heading", { name: "Nouvelle demande pour Amal Trabelsi" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé maladie/ })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-owner&type=sick",
    );
  });

  it("shows the form with the exception choice and says the request follows its normal steps", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    expect(await screen.findByRole("heading", { name: "Congé annuel pour Amal Trabelsi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Autoriser une exception")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
    expect(screen.getByText("La demande suit ensuite ses étapes normales.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Envoyer" })).toHaveLength(1);
  });

  it("creates the request for the employee with the exception and its reason, then opens it", async () => {
    const calls = serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await toggle("Autoriser une exception");
    setText("Motif de l'exception", "Solde épuisé, accord de la direction");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: true }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/new-1"));
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0]).toMatchObject({
      type: "annual",
      employee: "emp-owner",
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      override_reason: "Solde épuisé, accord de la direction",
    });
    expect(calls.submit).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("sends no exception when none was allowed", async () => {
    const calls = serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: false }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.create).toHaveLength(1));
    expect(calls.create[0]).toMatchObject({ type: "annual", employee: "emp-owner" });
    expect(calls.create[0]).not.toHaveProperty("override_reason");
  });

  it("is not available for an employee outside reach, nor for a type no longer offered", async () => {
    serve({ types: [TYPES.annual] });
    server.use(http.get("/api/v1/employees/emp-x", () => problemResponse(404, "core.not_found", "Introuvable.")));
    const first = open("/hr/requests/new?employee=emp-x");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
    first.unmount();
    open("/hr/requests/new?employee=emp-owner&type=remote");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });

  it("goes back to the list on cancel", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests");
  });
});
