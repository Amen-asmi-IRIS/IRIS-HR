import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import TeamRequestsPage from "./TeamRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const asTeam = { relation: "team" as const, actions: [], step_id: null };

const leave = makeRequest({ viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  viewer: asTeam,
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
  );
  return searches;
}

const open = (route = "/team/requests") => renderApp(<TeamRequestsPage />, { route, path: "/team/requests", me });

describe("My team, Requests (UI 6.4)", () => {
  it("shows the team's requests with requester, type, dates, length and status", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("En attente de votre décision")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(screen.getByText("2 j")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("team");
  });

  it("never shows a certificate sentence to the manager", async () => {
    serve();
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
  });

  it("filters by person, status and period", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    setText("Personne", "emp-5");
    await chooseOption("Situation", "En attente");
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("employee")).toBe("emp-5");
      expect(last?.get("status")).toBe("pending");
      expect(last?.get("from")).toBe("2026-11-01");
      expect(last?.get("to")).toBe("2026-11-30");
    });
  });

  it("has a second view: what I already decided", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.getByRole("button", { name: "Toute l'équipe" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Déjà décidées par moi" }));
    await waitFor(() => expect(searches.at(-1)?.get("scope")).toBe("decided"));
    expect(screen.getByRole("button", { name: "Déjà décidées par moi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens straight on the decided view from its address", async () => {
    const searches = serve();
    open("/team/requests?view=decided");
    await screen.findByText("Amal Trabelsi");
    expect(searches[0].get("scope")).toBe("decided");
  });

  it("opens a request in the team workspace and offers no primary action", async () => {
    serve();
    open();
    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByText("Amal Trabelsi"));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team/requests/req-1");
  });
});
