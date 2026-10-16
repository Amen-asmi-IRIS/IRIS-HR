import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import OverviewRequestsPage from "./OverviewRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] });
const asObserver = { relation: "overview" as const, actions: [], step_id: null };

const leave = makeRequest({ viewer: asObserver });
const sentBack = makeRequest({
  public_id: "req-3",
  employee: { public_id: "emp-3", name: "Nour Chaabane" },
  status: "returned",
  state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" },
  viewer: asObserver,
});
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  viewer: asObserver,
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sentBack, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () => HttpResponse.json([{ id: 4, name: "Sinistres" }])),
  );
  return searches;
}

const open = () => renderApp(<OverviewRequestsPage />, { route: "/overview/requests", path: "/overview/requests", me });

describe("Overview, Requests (UI 8.3)", () => {
  it("lists every request with who, department, type, dates, length and where it stands", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Renvoyée à Nour Chaabane")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
  });

  it("shows the dates and the status of a sick leave, never a word about its certificate", async () => {
    serve();
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
  });

  it("contains no action at all: nothing to create, nothing on a row but opening it", async () => {
    serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.queryByRole("link", { name: /Nouvelle demande/ })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    // The filters and the column that sorts the list (D41), then the rows that open.
    expect(buttons).toEqual(["Plus de filtres", "Dates", "Amal Trabelsi", "Nour Chaabane", "Karim Mansour"]);
  });

  it("filters like the HR list, with the same filters one step away", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    await chooseOption("Situation", "En attente");
    await userEvent.click(screen.getByRole("button", { name: "Plus de filtres" }));
    await chooseOption("Avec une exception", "Oui");
    await waitFor(() => {
      expect(searches.at(-1)?.get("status")).toBe("pending");
      expect(searches.at(-1)?.get("has_override")).toBe("1");
    });
  });

  it("opens a request inside Overview", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Karim Mansour" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/overview/requests/req-5");
  });
});
