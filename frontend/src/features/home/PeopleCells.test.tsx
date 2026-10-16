import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { PEOPLE_COLUMNS } from "@/features/employees/peopleColumns";
import TeamPeoplePage from "@/features/employees/TeamPeoplePage";
import { makeEmployeeRow, pageOf } from "@/features/employees/testing";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { BalanceCell, TodayCell } from "./PeopleCells";

const manager = makeMe({ roles: ["employee", "manager"] });

function team(people: { public_id: string; today: "in" | "absent" | "remote"; balance: string; waiting?: boolean }[]) {
  let reads = 0;
  server.use(http.get("/api/v1/home/team", () => {
    reads += 1;
    return HttpResponse.json({ who_is_out: [], delegation: null, people: people.map((person) => ({ waiting: false, ...person })) });
  }));
  return () => reads;
}

describe("People cells", () => {
  it.each([
    ["in", "Présent(e)"],
    ["absent", "Absent(e)"],
    ["remote", "En télétravail"],
  ] as const)("says %s in words", async (today, words) => {
    team([{ public_id: "emp-1", today, balance: "7.50" }]);
    renderApp(<TodayCell employeeId="emp-1" />, { route: "/team/people", path: "/team/people", me: manager });

    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it("says absent and pending for a sick leave that waits for HR", async () => {
    team([{ public_id: "emp-1", today: "absent", balance: "7.50", waiting: true }]);
    renderApp(<TodayCell employeeId="emp-1" />, { route: "/team/people", path: "/team/people", me: manager });

    expect(await screen.findByText("Absent(e) · en attente")).toBeInTheDocument();
  });

  it("shows the balance in days", async () => {
    team([{ public_id: "emp-1", today: "in", balance: "7.50" }]);
    renderApp(<BalanceCell employeeId="emp-1" />, { route: "/team/people", path: "/team/people", me: manager });

    expect(await screen.findByText("7,5 jours")).toBeInTheDocument();
  });

  it("stays empty for a person the answer does not carry", async () => {
    team([]);
    const { container } = renderApp(
      <><TodayCell employeeId="emp-9" /><BalanceCell employeeId="emp-9" /></>,
      { route: "/team/people", path: "/team/people", me: manager },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });
});

describe("People list of My team", () => {
  it("registers today and annual balance between position and requests waiting", () => {
    const columns = [...PEOPLE_COLUMNS].sort((a, b) => a.order - b.order).map((column) => column.id);
    expect(columns).toEqual(["name", "position", "today", "balance", "waiting"]);
  });

  it("fills both columns for every row from one read of the team", async () => {
    const reads = team([
      { public_id: "emp-1", today: "remote", balance: "12.50" },
      { public_id: "emp-2", today: "absent", balance: "0.00" },
    ]);
    server.use(
      http.get("/api/v1/employees", () => HttpResponse.json(pageOf([
        makeEmployeeRow({ employee_number: null, manager: null, status: null }),
        makeEmployeeRow({ public_id: "emp-2", name: "Bilel Employee", employee_number: null, manager: null, status: null }),
      ]))),
      http.get("/api/v1/requests", () => HttpResponse.json(makePage([]))),       // plan 03b's "requests waiting" column
    );
    renderApp(<TeamPeoplePage />, { route: "/team/people", path: "/team/people", me: manager });

    const table = within(await screen.findByRole("table", { name: "Personnes" }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(
      ["Nom", "Poste", "Aujourd'hui", "Solde annuel", "Demandes en attente"]);
    expect(await table.findByText("En télétravail")).toBeInTheDocument();
    expect(table.getByText("12,5 jours")).toBeInTheDocument();
    expect(table.getByText("Absent(e)")).toBeInTheDocument();
    expect(table.getByText("0 jour")).toBeInTheDocument();
    expect(reads()).toBe(1);
  });
});
