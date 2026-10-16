import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "@/api/types";
import { meKey } from "@/features/auth/api";
import { markSignedOut } from "@/features/auth/session";
import i18n from "@/i18n";
import { makeMe, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { RequireAuth, RequirePasswordChange, RequireWorkspace, safeNext } from "./guards";

// What exists in this test, whatever later plans add: Administration has one page, My team has none.
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [] }));
vi.mock("@/app/homes", () => ({ HOMES: {} }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** Opens an address behind the three guards. `me` undefined means "not loaded yet". */
function open(address: string, me: Me | null | undefined) {
  const queryClient = makeTestQueryClient();
  if (me !== undefined) queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      { path: "/login", element: <Where /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/password/new", element: <Where /> },
          {
            element: <RequirePasswordChange />,
            children: [
              { path: "/", element: <p>Accueil</p> },
              { path: "/admin", element: <RequireWorkspace id="admin" />, children: [{ path: "accounts", element: <p>Page des comptes</p> }] },
              { path: "/team", element: <RequireWorkspace id="team" />, children: [{ path: "people", element: <p>Page des personnes</p> }] },
            ],
          },
        ],
      },
    ],
    { initialEntries: [address] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe("safeNext", () => {
  it.each(["/admin/accounts", "/admin/accounts?state=locked&page=2", "/me", "/requests/abc#steps"])("keeps the inside address %s", (next) => {
    expect(safeNext(next)).toBe(next);
  });

  it.each([null, "", "admin", "//evil.example", "/\\evil.example", "https://evil.example/x", "javascript:alert(1)", "/login", "/login?next=/login"])(
    "refuses %s",
    (next) => {
      expect(safeNext(next)).toBeNull();
    },
  );

  // A browser drops tabs and line breaks from an address and reads a backslash as a slash.
  it.each([
    ["a tab", "/\t/evil.example"],
    ["a line break", "/\n/evil.example"],
    ["a backslash further in", "/admin\\evil.example"],
  ])("refuses an address with %s in it", (_what, next) => {
    expect(safeNext(next)).toBeNull();
  });
});

describe("RequireAuth", () => {
  it("sends an anonymous visitor to Sign in and remembers the page with its filters", () => {
    open("/admin/accounts?state=locked", null);
    expect(screen.getByTestId("where")).toHaveTextContent("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");
  });

  it("asks for no return when the visitor was on the root", () => {
    open("/", null);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/login$/);
  });

  it("asks for no return after a deliberate sign-out", () => {
    markSignedOut();
    open("/admin/accounts", null);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/login$/);
  });

  it("lets a signed-in user through", () => {
    open("/admin/accounts", makeMe());
    expect(screen.getByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'being updated' while the application is away, then carries on", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html>502</html>", { status: 502 })));
    open("/admin/accounts", undefined);
    expect(await screen.findByRole("heading", { name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();

    server.use(http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe())));
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'something went wrong' with the reference when the session cannot be read", async () => {
    server.use(http.get("/api/v1/auth/me", () => problemResponse(500, "core.unexpected", "")));
    open("/admin/accounts", undefined);
    expect(await screen.findByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : req-test")).toBeInTheDocument();
  });

  it("switches to the language stored on the account", async () => {
    open("/admin/accounts", makeMe({ language: "en" }));
    await waitFor(() => expect(i18n.language).toBe("en"));
  });
});

describe("RequirePasswordChange", () => {
  it("lets nothing else be reached until the temporary password is replaced", () => {
    open("/admin/accounts", makeMe({ must_change_password: true }));
    expect(screen.getByTestId("where")).toHaveTextContent("/password/new");
    expect(screen.queryByText("Page des comptes")).not.toBeInTheDocument();
  });
});

describe("RequireWorkspace", () => {
  it("opens a workspace to its role", () => {
    open("/admin/accounts", makeMe({ roles: ["sysadmin"] }));
    expect(screen.getByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'not available' to another role, without revealing the page", () => {
    open("/admin/accounts", makeMe({ roles: ["employee", "hr"] }));
    expect(screen.getByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
    expect(screen.queryByText("Page des comptes")).not.toBeInTheDocument();
  });

  it("shows 'not available' for a workspace that has no page yet, even to its role", () => {
    open("/team/people", makeMe({ roles: ["employee", "manager"] }));
    expect(screen.getByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
