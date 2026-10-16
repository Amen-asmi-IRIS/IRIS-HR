import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeesPage from "./EmployeesPage";
import { makeDepartment, makeEmployeeRow, pageOf } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const executive = makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] });

describe("EmployeesPage", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/departments", () => HttpResponse.json([makeDepartment()])));
  });

  it("lists each employee with six attributes and links to the record", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([makeEmployeeRow()]))));

    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    const name = await screen.findByRole("link", { name: "Amal Employee" });
    expect(name).toHaveAttribute("href", "/hr/employees/emp-1");
    // The filters offer "Souscription" and "En poste" too, so look inside the table.
    const table = within(screen.getByRole("table", { name: "Employés" }));
    expect(table.getAllByRole("columnheader")).toHaveLength(6);
    for (const text of ["E004", "Souscription", "Chargé de clientèle", "Mounir Manager", "En poste"]) {
      expect(table.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Nouvel employé" })).toHaveAttribute("href", "/hr/employees/new");
  });

  it("sends the search and asks for people who left only on request", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("/api/v1/employees", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json(pageOf([]));
      }),
    );
    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.at(-1)?.get("scope")).toBe("all");
    expect(seen.at(-1)?.get("status")).toBeNull();

    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher" }), "amal");
    await waitFor(() => expect(seen.at(-1)?.get("search")).toBe("amal"));

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Statut" }), "archived");
    await waitFor(() => expect(seen.at(-1)?.get("status")).toBe("archived"));

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Département" }), "1");
    await waitFor(() => expect(seen.at(-1)?.get("department")).toBe("1"));
  });

  it("says why the list is empty", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([]))));

    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    expect(await screen.findByText("Aucun employé ne correspond")).toBeInTheDocument();
    expect(screen.getByText("Modifiez la recherche ou les filtres.")).toBeInTheDocument();
  });

  it("shows no action to an executive", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([makeEmployeeRow()]))));

    renderApp(<EmployeesPage mode="overview" />, { route: "/overview/people", me: executive });

    const name = await screen.findByRole("link", { name: "Amal Employee" });
    expect(name).toHaveAttribute("href", "/overview/people/emp-1");
    expect(screen.getByRole("heading", { level: 1, name: "Personnes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nouvel employé" })).not.toBeInTheDocument();
    // Nothing but the column headers that sort the list (D41): no action on the data.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Nom", "Matricule"]);
  });
});
