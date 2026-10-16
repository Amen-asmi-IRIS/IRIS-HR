import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange } from "@/lib/format";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import type { ReportData } from "./api";
import { ReportTable } from "./ReportTable";

const me = makeMe({ roles: ["employee", "hr"] });

const absences: ReportData = {
  columns: [
    { key: "employee", label: "Salarié", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "period", label: "Dates", kind: "period" },
    { key: "days", label: "Jours", kind: "number" },
    { key: "hours", label: "Heures", kind: "number" },
  ],
  rows: [
    { employee: "Amal Employee", type: "Congé annuel", period: { start: "2026-11-02", end: "2026-11-03" }, days: "1.50", hours: null },
    { employee: "Amal Employee", type: "Permission", period: { start: "2026-11-24", end: "2026-11-24" }, days: null, hours: "2.50" },
  ],
  totals: {
    lines: [
      { group: "overall", label: "Total", values: { days: "1.50", hours: "2.50" } },
      { group: "by_employee", label: "Amal Employee", values: { days: "1.50", hours: "2.50" } },
      { group: "by_type", label: "Congé annuel", values: { days: "1.50", hours: null } },
    ],
  },
  notes: [],
};

describe("ReportTable", () => {
  it("shows the result as a labelled, scrollable table", () => {
    renderApp(<ReportTable data={absences} label="Résultat : Absences prises" />, { route: "/hr/reports/absences", me });

    const region = screen.getByRole("region", { name: "Résultat : Absences prises" });
    expect(region).toHaveAttribute("tabindex", "0");
    const table = within(region).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Salarié",
      "Type",
      "Dates",
      "Jours",
      "Heures",
    ]);
    expect(within(table).getByText(formatDateRange("2026-11-02", "2026-11-03", "fr"))).toBeInTheDocument();
    expect(within(table).getByText(formatDate("2026-11-24", "fr"))).toBeInTheDocument();
    expect(within(table).getAllByText("1,5").length).toBeGreaterThan(0);
  });

  it("ends the table with the overall total", () => {
    renderApp(<ReportTable data={absences} label="Résultat" />, { route: "/hr/reports/absences", me });

    const total = screen.getByRole("row", { name: /^Total/ });
    expect(within(total).getByText("1,5")).toBeInTheDocument();
    expect(within(total).getByText("2,5")).toBeInTheDocument();
  });

  it("shows the totals per employee and per type under their own headings", () => {
    renderApp(<ReportTable data={absences} label="Résultat" />, { route: "/hr/reports/absences", me });

    const perEmployee = screen.getByRole("table", { name: "Totaux par salarié" });
    expect(within(perEmployee).getByRole("rowheader", { name: "Amal Employee" })).toBeInTheDocument();
    const perType = screen.getByRole("table", { name: "Totaux par type" });
    expect(within(perType).getByRole("rowheader", { name: "Congé annuel" })).toBeInTheDocument();
  });

  it("shows no totals when the report has none", () => {
    renderApp(<ReportTable data={{ ...absences, totals: null }} label="Résultat" />, { route: "/hr/reports/absences", me });

    expect(screen.queryByRole("row", { name: /^Total/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Totaux par type" })).not.toBeInTheDocument();
  });

  it("shows every column of a year by month", () => {
    const months = Array.from({ length: 12 }, (_, index) => `m${String(index + 1).padStart(2, "0")}`);
    const yearly: ReportData = {
      columns: [
        { key: "employee", label: "Salarié", kind: "text" },
        ...months.map((key) => ({ key, label: key, kind: "number" as const })),
        { key: "total", label: "Total", kind: "number" },
      ],
      rows: [{ employee: "Amal Employee", ...Object.fromEntries(months.map((key) => [key, null])), m11: "2.00", total: "2.00" }],
      totals: null,
      notes: [],
    };

    renderApp(<ReportTable data={yearly} label="Résultat" />, { route: "/hr/reports/remote-days", me });

    expect(screen.getAllByRole("columnheader")).toHaveLength(14);
  });
});
