import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReportFilterOptions } from "@/api/types";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";

const options: ReportFilterOptions = {
  scope: "all",
  departments: [
    { id: 1, name: "Souscription" },
    { id: 2, name: "Sinistres" },
  ],
  employees: [
    { public_id: "e-1", name: "Amal Employee" },
    { public_id: "e-2", name: "Bilel Employee" },
  ],
  actors: [],
  types: [
    { code: "annual", name: "Congé annuel" },
    { code: "sick", name: "Congé maladie" },
  ],
  steps: [
    { code: "line_manager", name: "Le responsable" },
    { code: "hr_role", name: "RH" },
  ],
};

const me = makeMe({ roles: ["employee", "hr"] });

function show(props: Partial<Parameters<typeof ReportFilters>[0]> = {}) {
  const onChange = vi.fn();
  renderApp(
    <ReportFilters
      filters={{ visible: ["period", "employee", "type"], more: ["department"] }}
      options={options}
      values={{ from: "2026-11-01", to: "2026-11-30" }}
      onChange={onChange}
      {...props}
    />,
    { route: "/hr/reports/absences", me },
  );
  return onChange;
}

describe("ReportFilters", () => {
  it("shows three filters and keeps the others one step away", async () => {
    const user = userEvent.setup();
    show();

    const period = screen.getByRole("group", { name: "Période" });
    expect(within(period).getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(within(period).getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(screen.getByRole("combobox", { name: "Salarié" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Département" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));

    expect(screen.getByRole("combobox", { name: "Département" })).toBeInTheDocument();
  });

  it("offers what the API allows, with an entry for no filter", () => {
    show();

    const employee = screen.getByRole("combobox", { name: "Salarié" });
    expect(within(employee).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tous",
      "Amal Employee",
      "Bilel Employee",
    ]);
  });

  it("reports a change as a patch", async () => {
    const onChange = show();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "sick");
    expect(onChange).toHaveBeenLastCalledWith({ type: "sick" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Salarié" }), "");
    expect(onChange).toHaveBeenLastCalledWith({ employee: "" });

    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-15" } });
    expect(onChange).toHaveBeenLastCalledWith({ to: "2026-11-15" });
  });

  it("draws the other kinds of filter", () => {
    show({
      filters: { visible: ["on", "year", "step"], more: [] },
      values: { on: "2026-11-18", year: "2026" },
    });

    expect(screen.getByLabelText("À la date du")).toHaveValue("2026-11-18");
    expect(screen.getByRole("combobox", { name: "Année" })).toHaveValue("2026");
    expect(within(screen.getByRole("combobox", { name: "Étape" })).getByRole("option", { name: "RH" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plus de filtres" })).not.toBeInTheDocument();
  });
});

describe("ReportProblems", () => {
  const problem = (field: string | null, detail: string) => ({ field, code: "reports.x", detail, params: {} });

  it("names the filter each problem is about", () => {
    renderApp(
      <ReportProblems
        problems={[
          problem("to", "La date de fin précède la date de début."),
          problem(null, "Rien à afficher."),
        ]}
      />,
      { route: "/hr/reports/absences", me },
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(alert).toHaveTextContent("Rien à afficher.");
  });

  it("shows a problem on a field it does not know by its message alone", () => {
    renderApp(<ReportProblems problems={[problem("scope", "Choisissez votre équipe.")]} />, { route: "/hr/reports/absences", me });

    expect(screen.getByRole("alert")).toHaveTextContent(/^Choisissez votre équipe\.$/);
  });

  it("draws nothing when there is no problem", () => {
    renderApp(<ReportProblems problems={[]} />, { route: "/hr/reports/absences", me });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
