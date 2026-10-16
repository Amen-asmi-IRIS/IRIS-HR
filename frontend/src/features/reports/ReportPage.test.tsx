import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportFilterOptions } from "@/api/types";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ReportData } from "./api";
import ReportPage from "./ReportPage";

vi.mock("@/components/NotAvailable", () => ({ NotAvailable: () => <p>not-available</p> }));

const NOVEMBER = "from=2026-11-01&to=2026-11-30";

const options: ReportFilterOptions = {
  scope: "all",
  departments: [{ id: 1, name: "Souscription" }],
  employees: [{ public_id: "e-1", name: "Amal Employee" }],
  actors: [],
  types: [
    { code: "annual", name: "Congé annuel" },
    { code: "sick", name: "Congé maladie" },
  ],
  steps: [{ code: "hr_role", name: "RH" }],
};

const absences: ReportData = {
  columns: [
    { key: "employee", label: "Salarié", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "period", label: "Dates", kind: "period" },
    { key: "days", label: "Jours", kind: "number" },
  ],
  rows: [{ employee: "Amal Employee", type: "Congé annuel", period: { start: "2026-11-02", end: "2026-11-02" }, days: "1.00" }],
  totals: { lines: [{ group: "overall", label: "Total", values: { days: "1.00" } }] },
  notes: [],
};

const hr = makeMe({ roles: ["employee", "hr"] });
const manager = makeMe({ roles: ["employee", "manager"] });

let asked: URL[] = [];

function show(workspace: "team" | "hr" | "overview", name: string, search: string, me = hr) {
  renderApp(
    <ProblemBoundary>
      <ReportPage workspace={workspace} name={name} />
    </ProblemBoundary>,
    { route: `/${workspace}/reports/${name}${search ? `?${search}` : ""}`, me },
  );
}

beforeEach(() => {
  asked = [];
  server.use(
    http.get("/api/v1/report-filters", () => HttpResponse.json(options)),
    http.get("/api/v1/reports/absences", ({ request }) => {
      asked.push(new URL(request.url));
      return HttpResponse.json(absences);
    }),
  );
});

describe("ReportPage", () => {
  it("shows the report for the selection in the address", async () => {
    show("hr", "absences", NOVEMBER);

    expect(await screen.findByRole("heading", { level: 1, name: "Absences prises" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Résultat : Absences prises" })).toBeInTheDocument();
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({ from: "2026-11-01", to: "2026-11-30", scope: "all" });
  });

  it("has one primary action: a download of exactly what is shown", async () => {
    show("hr", "absences", `${NOVEMBER}&type=annual`);

    await screen.findByRole("region", { name: "Résultat : Absences prises" });
    const links = screen.getAllByRole("link", { name: "Exporter vers Excel" });
    expect(links).toHaveLength(1);
    const address = new URL(links[0].getAttribute("href")!, "http://localhost");
    expect(address.pathname).toBe("/api/v1/reports/absences");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      type: "annual",
      scope: "all",
      format: "xlsx",
    });
    expect(links[0]).toHaveAttribute("download");
  });

  it("limits a manager to the team and offers no department filter", async () => {
    show("team", "absences", NOVEMBER, manager);

    await screen.findByRole("region", { name: "Résultat : Absences prises" });
    expect(asked[0].searchParams.get("scope")).toBe("team");
    // The workbook is the team's too: a manager asking for everyone would be refused.
    const link = screen.getByRole("link", { name: "Exporter vers Excel" });
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("scope")).toBe("team");
    expect(screen.getByText("Ces rapports portent sur votre équipe.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Département" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plus de filtres" })).not.toBeInTheDocument();
  });

  it("asks again when a filter changes, and keeps the others", async () => {
    const user = userEvent.setup();
    show("hr", "absences", NOVEMBER);
    await screen.findByRole("region", { name: "Résultat : Absences prises" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "sick");

    await waitFor(() => expect(asked.at(-1)?.searchParams.get("type")).toBe("sick"));
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2026-11-01");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("sick");
  });

  it("says under the result what the figures count, when the API says it", async () => {
    // "Balances at a date" on a date today or later counts the month-end credits not posted yet (master 13.1).
    const note = "Les soldes au 30/11/2026 comprennent les crédits de fin de mois qui ne sont pas encore enregistrés.";
    server.use(http.get("/api/v1/reports/absences", () => HttpResponse.json({ ...absences, notes: [note] })));

    show("hr", "absences", NOVEMBER);

    await screen.findByRole("region", { name: "Résultat : Absences prises" });
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("says why the result is empty and offers no export", async () => {
    server.use(http.get("/api/v1/reports/absences", () => HttpResponse.json({ ...absences, rows: [], totals: null })));

    show("hr", "absences", NOVEMBER);

    expect(await screen.findByText("Rien à afficher pour cette sélection.")).toBeInTheDocument();
    expect(screen.getByText("Élargissez la période ou retirez un filtre.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exporter vers Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains a refused selection under the filters and keeps what was chosen", async () => {
    server.use(
      http.get("/api/v1/reports/absences", () =>
        problemResponse(400, "reports.period_order", "La date de fin précède la date de début.", [{ field: "to" }]),
      ),
    );

    show("hr", "absences", "from=2026-11-30&to=2026-11-01");

    expect(await screen.findByRole("alert")).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-30");
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-01");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exporter vers Excel" })).not.toBeInTheDocument();
  });

  it("shows 'not available' when the selection names someone out of reach", async () => {
    server.use(
      http.get("/api/v1/reports/absences", () =>
        problemResponse(404, "reports.employee_not_found", "Cette personne n'est pas disponible."),
      ),
    );

    show("team", "absences", `${NOVEMBER}&employee=someone-else`, manager);

    expect(await screen.findByText("not-available")).toBeInTheDocument();
  });

  it("shows nothing of a report the workspace does not have", () => {
    show("overview", "certificates", "", makeMe({ roles: ["employee", "exec"] }));

    expect(screen.getByText("not-available")).toBeInTheDocument();
    expect(asked).toHaveLength(0);
  });
});
