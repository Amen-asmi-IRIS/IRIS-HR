import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import HrRequestsPage from "./HrRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const leave = makeRequest({ viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 } });
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "due", due_at: "2026-11-04T09:00:00+01:00" },
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: 21 },
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () =>
      HttpResponse.json([
        { id: 3, name: "Souscription" },
        { id: 4, name: "Sinistres" },
      ]),
    ),
  );
  return searches;
}

const open = () => renderApp(<HrRequestsPage />, { route: "/hr/requests", path: "/hr/requests", me });

describe("HR desk, Requests (UI 7.6)", () => {
  it("lists every request with who, department, type, dates, length and where it stands", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("Souscription")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(screen.getByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    // HR is told where the certificate stands.
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-04T09:00:00+01:00)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
  });

  it("has one primary action, New request for an employee", async () => {
    serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.getByRole("link", { name: "Nouvelle demande pour un employé" })).toHaveAttribute("href", "/hr/requests/new");
  });

  it("filters by employee, status and period", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    setText("Personne", "emp-5");
    await chooseOption("Situation", "Approuvées");
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("employee")).toBe("emp-5");
      expect(last?.get("status")).toBe("approved");
      expect(last?.get("from")).toBe("2026-11-01");
      expect(last?.get("to")).toBe("2026-11-30");
    });
  });

  it("keeps department, type, entered by HR and with an exception one step away", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.queryByLabelText("Saisies par les RH")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Plus de filtres" }));
    await screen.findByRole("option", { name: "Sinistres" });
    await screen.findByRole("option", { name: "Télétravail" });
    await chooseOption("Département", "Sinistres");
    await chooseOption("Type", "Télétravail");
    await chooseOption("Saisies par les RH", "Oui");
    await chooseOption("Avec une exception", "Non");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("department")).toBe("4");
      expect(last?.get("type")).toBe("remote");
      expect(last?.get("on_behalf")).toBe("1");
      expect(last?.get("has_override")).toBe("0");
    });
  });

  it("opens a request on the HR desk", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Amal Trabelsi" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });
});
