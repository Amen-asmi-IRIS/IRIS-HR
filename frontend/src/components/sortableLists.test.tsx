import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import AccountsPage from "@/features/accounts/AccountsPage";
import AuditLogPage from "@/features/audit/AuditLogPage";
import EmployeesPage from "@/features/employees/EmployeesPage";
import { makeRequest } from "@/features/requests/fixtures";
import { RequestsList } from "@/features/requests/lists/RequestsList";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

/** Serves a list and remembers the `ordering` of each call. */
function serve(path: string, results: unknown[]): (string | null)[] {
  const asked: (string | null)[] = [];
  server.use(http.get(path, ({ request }) => {
    asked.push(new URL(request.url).searchParams.get("ordering"));
    return HttpResponse.json(page(results));
  }));
  return asked;
}

async function clickFirstSort(): Promise<HTMLElement> {
  const header = (await screen.findAllByRole("columnheader")).find((cell) => cell.hasAttribute("aria-sort"));
  expect(header, "no column of this table can sort").toBeDefined();
  await userEvent.click(within(header!).getByRole("button"));
  return header!;
}

describe("the large tables can be sorted", () => {
  it("accounts, by name", async () => {
    const asked = serve("/api/v1/accounts", [{
      public_id: "a1", email: "employee.a1@impactrisks.com", name: "Amal Employee", state: "active",
      roles: [], last_login_at: null, has_employee: true,
    }]);
    renderApp(<AccountsPage />, { route: "/admin/accounts", me: makeMe({ roles: ["sysadmin"], workspaces: ["admin"] }) });

    const header = await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("name"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(asked.at(-1)).toBe("-name"));
  });

  it("a log, by time", async () => {
    const asked = serve("/api/v1/audit/security", [{
      id: 1, at: "2026-11-02T09:00:00+01:00", actor: "Sonia Admin", category: "security", action: "auth.login",
      object_type: "user", object_id: "u1", object_label: "sysadmin@impactrisks.com", changes: {},
      ip_address: "10.0.0.5", request_id: "r1",
    }]);
    server.use(http.get("/api/v1/accounts", () => HttpResponse.json(page([]))));
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log", me: makeMe({ roles: ["sysadmin"], workspaces: ["admin"] }) });

    await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("at"));                 // oldest first
    const exported = screen.getAllByRole("link").find((link) => (link.getAttribute("href") ?? "").includes("/audit/security/export"));
    expect(exported?.getAttribute("href")).toContain("ordering=at");      // the export follows the list
  });

  it("employees, by name", async () => {
    const asked = serve("/api/v1/employees", [{
      public_id: "e1", name: "Amal Employee", employee_number: "E004",
      department: { id: 1, name: "Souscription" }, position: { id: 1, title: "Chargé de clientèle" },
      manager: { public_id: "e3", name: "Mounir Manager" }, status: "active",
    }]);
    server.use(http.get("/api/v1/departments", () => HttpResponse.json([])));
    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }) });

    await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("name"));
  });

  it("requests, by date", async () => {
    const asked = serve("/api/v1/requests", [makeRequest()]);
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    renderApp(
      <RequestsList scope="mine" columns={["type", "when", "quantity", "status"]} filters={["status"]} empty={<p>Vide</p>} label="Mes demandes" />,
      { route: "/me/requests", me: makeMe({ roles: ["employee"], workspaces: ["me"] }) },
    );

    const header = await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("start_date"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });
});
