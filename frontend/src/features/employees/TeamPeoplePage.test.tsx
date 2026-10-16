import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { PEOPLE_COLUMNS } from "./peopleColumns";
import TeamPeoplePage from "./TeamPeoplePage";
import { makeEmployeeRow, pageOf } from "./testing";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
// What the API gives a manager: no number, no manager, no status.
const member = makeEmployeeRow({ employee_number: null, manager: null, status: null });

function mount() {
  return renderApp(<TeamPeoplePage />, { route: "/team/people", path: "/team/people", me: manager });
}

describe("TeamPeoplePage", () => {
  it("lists my team with a name and a position, and links to the person", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("/api/v1/employees", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json(pageOf([member]));
      }),
    );

    mount();

    expect(await screen.findByRole("link", { name: "Amal Employee" })).toHaveAttribute(
      "href",
      "/team/people/emp-1",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Personnes" })).toBeInTheDocument();
    const table = within(screen.getByRole("table", { name: "Personnes" }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Nom",
      "Poste",
      "Aujourd'hui",
      "Solde annuel",
      "Demandes en attente",
    ]);
    expect(table.getByText("Chargé de clientèle")).toBeInTheDocument();
    expect(seen.at(-1)?.get("scope")).toBe("team");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains an empty team", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([]))));

    mount();

    expect(await screen.findByText("Personne ne vous est rattaché")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Les personnes dont vous êtes responsable, ou qui vous sont confiées par délégation, apparaissent ici.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the columns other features register, in their order", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([member]))));
    PEOPLE_COLUMNS.push({ id: "probe", headerKey: "employees:fields.phone", order: 15, cell: (row) => row.phone });
    try {
      mount();

      const table = within(await screen.findByRole("table", { name: "Personnes" }));
      expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Nom",
        "Téléphone",
        "Poste",
        "Aujourd'hui",
        "Solde annuel",
        "Demandes en attente",
      ]);
      expect(table.getByText("20 123 456")).toBeInTheDocument();
    } finally {
      PEOPLE_COLUMNS.pop();
    }
  });
});
