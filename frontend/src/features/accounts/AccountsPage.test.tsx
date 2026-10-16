import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Account } from "@/api/types";
import { makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AccountsPage from "./AccountsPage";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    public_id: "a1",
    email: "sami.benali@impactrisks.com",
    name: "Sami Ben Ali",
    state: "active",
    roles: ["hr"],
    last_login_at: "2026-10-05T09:00:00+01:00",
    has_employee: true,
    ...overrides,
  } as Account;
}

const accounts = [
  makeAccount(),
  makeAccount({ public_id: "a2", name: "Leila Trabelsi", email: "leila.trabelsi@impactrisks.com", state: "awaiting_first_sign_in", roles: [], last_login_at: null }),
  makeAccount({ public_id: "a3", name: "Nour Gharbi", email: "nour.gharbi@impactrisks.com", state: "locked", roles: ["exec", "manager"] }),
  makeAccount({ public_id: "a4", name: "Samia Admin", email: "sysadmin@impactrisks.com", state: "disabled", roles: ["sysadmin"] }),
];

/** Answers the list and records the query of every call. */
function listing(seen: URLSearchParams[], items: Account[] = accounts, count?: number) {
  return http.get("/api/v1/accounts", ({ request }) => {
    seen.push(new URL(request.url).searchParams);
    return HttpResponse.json(makePage(items, count));
  });
}

describe("AccountsPage", () => {
  it("shows each account with its state as a sentence, its roles and its last sign-in", async () => {
    const seen: URLSearchParams[] = [];
    server.use(listing(seen));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(screen.getByRole("heading", { level: 1, name: "Comptes" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Comptes" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Nom", "Adresse e-mail", "État", "Rôles", "Dernière connexion"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Actif")).toBeInTheDocument();
    expect(within(rows[0]).getByText("RH")).toBeInTheDocument();
    expect((rows[0].textContent ?? "").replace(/\s/g, " ")).toContain("5 oct. 2026 à 09:00");
    expect(within(rows[1]).getByText("En attente de première connexion")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Aucun rôle")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Jamais")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Verrouillé")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Direction générale, Responsable")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Désactivé")).toBeInTheDocument();
    expect(seen[0].get("page_size")).toBe("25");
    expect(seen[0].get("page")).toBe("1");
  });

  it("opens an account and offers to create one", async () => {
    const user = userEvent.setup();
    server.use(listing([]));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/admin/accounts/new");
    await user.click(await screen.findByRole("button", { name: "Nour Gharbi" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts/a3");
  });

  it("sends the three filters to the API and keeps them in the address", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(listing(seen));
    const { router } = renderApp(<AccountsPage />, { route: "/admin/accounts" });
    await screen.findByRole("table", { name: "Comptes" });
    await user.type(screen.getByRole("searchbox", { name: "Nom ou adresse e-mail" }), "nour");
    await user.selectOptions(screen.getByRole("combobox", { name: "État" }), "locked");
    await user.selectOptions(screen.getByRole("combobox", { name: "Rôles" }), "exec");
    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.get("search")).toBe("nour");
      expect(last?.get("state")).toBe("locked");
      expect(last?.get("role")).toBe("exec");
    });
    expect(router.state.location.search).toBe("?search=nour&state=locked&role=exec");
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("explains an empty result and offers the action that fills it", async () => {
    server.use(listing([], []));
    renderApp(<AccountsPage />, { route: "/admin/accounts?state=locked" });
    expect(await screen.findByText("Aucun compte ne correspond à ces filtres.")).toBeInTheDocument();
    expect(screen.getByText("Modifiez les filtres, ou créez un compte.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Créer un compte" })).toHaveLength(2);
  });

  it("pages through a long list", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(listing(seen, accounts, 60));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(await screen.findByText("Page 1 sur 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    await waitFor(() => expect(seen.at(-1)?.get("page")).toBe("2"));
  });

  it("offers no creation when it is read-only", async () => {
    server.use(listing([]));
    renderApp(<AccountsPage readOnly />, { route: "/admin/accounts" });
    await screen.findByRole("table", { name: "Comptes" });
    expect(screen.queryByRole("link", { name: "Créer un compte" })).not.toBeInTheDocument();
  });
});
