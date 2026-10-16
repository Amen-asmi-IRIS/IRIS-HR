import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import type { Me } from "@/api/types";
import { meKey } from "@/features/auth/api";
import { markSignedIn } from "@/features/auth/session";
import { makeMe } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { setPhoneViewport } from "@/test/viewport";
import AppShell from "./AppShell";

vi.mock("@/app/homes", () => ({ HOMES: { admin: () => null } }));
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [{ path: "people", element: null }] }));

function Failing(): never {
  throw new ProblemError({ status: 500, code: "core.unexpected", detail: "", requestId: "req-7" });
}

function Unreachable(): never {
  throw new ProblemError({ status: 503, code: "core.unavailable", detail: "" });
}

function openShell(address: string, me: Me = makeMe({ last_workspace: "admin" })) {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: "/admin/accounts", element: <p>Page des comptes</p> },
          { path: "/team/people", element: <Link to="/admin/accounts">Vers les comptes</Link> },
          { path: "/notifications", element: <p>Page des notifications</p> },
          { path: "/typing", element: <input aria-label="Motif" /> },
          { path: "/broken", element: <Failing /> },
          { path: "/away", element: <Unreachable /> },
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

describe("AppShell on a desktop", () => {
  it("frames the page with the logo, the navigation and, at the bottom, notifications, language and the user menu", async () => {
    openShell("/admin/accounts");
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByRole("img", { name: "IRIS HR" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Comptes" })).toHaveAttribute("aria-current", "page");
    expect(await within(sidebar).findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("group", { name: "Langue" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Menu de Samia Admin" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("Page des comptes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#main");
  });

  it("has no workspace switcher for one workspace, and no environment strip outside the test stack", () => {
    openShell("/admin/accounts");
    expect(screen.queryByRole("button", { name: /^Espace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows the switcher to a person with several workspaces, and the strip on the test stack", () => {
    openShell("/admin/accounts", makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "admin", environment: "test" }));
    expect(screen.getByRole("button", { name: "Espace : Administration" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Environnement de test. Ceci n'est pas la production.");
  });

  it("keeps the navigation of the landing workspace on a page that belongs to none", () => {
    openShell("/notifications");
    expect(screen.getByText("Page des notifications")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comptes" })).not.toHaveAttribute("aria-current");
  });

  it("stores the workspace in use, so that the next sign-in lands there", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const me = makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "team" });
    server.use(
      http.patch("/api/v1/auth/me", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        seen.push(body);
        return HttpResponse.json({ ...me, ...body });
      }),
    );
    openShell("/team/people", me);
    expect(seen).toEqual([]);
    await user.click(screen.getByRole("link", { name: "Vers les comptes" }));
    await waitFor(() => expect(seen).toEqual([{ last_workspace: "admin" }]));
  });

  it("shows the sign-in notice once, above the page", () => {
    markSignedIn();
    openShell("/admin/accounts");
    expect(within(screen.getByRole("main")).getByRole("complementary", { name: "À propos de votre connexion" })).toBeInTheDocument();
  });

  it("keeps the frame when a page fails, and shows the reference", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openShell("/broken");
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : req-7")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
  });

  it("keeps the frame when the application goes away under a page, and says it will be back", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openShell("/away");
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Une erreur est survenue" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
  });
});

describe("AppShell on a phone", () => {
  it("has a top bar with the workspace name, notifications and the user menu, and a tab bar", async () => {
    setPhoneViewport(true);
    openShell("/admin/accounts");
    const bar = screen.getByRole("banner");
    expect(within(bar).getByText("Administration")).toBeInTheDocument();
    expect(await within(bar).findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Menu de Samia Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Langue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "IRIS HR" })).not.toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(tabs).getAllByRole("link").map((link) => link.textContent)).toEqual(["État", "Comptes"]);
    expect(within(screen.getByRole("main")).getByText("Page des comptes")).toBeInTheDocument();
  });

  it("puts the switcher in the top bar for a person with several workspaces", () => {
    setPhoneViewport(true);
    openShell("/admin/accounts", makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "admin" }));
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Espace : Administration" })).toBeInTheDocument();
  });
});

describe("AppShell when the window changes size", () => {
  it("keeps the page and what was typed in it when the layout changes, as when a phone is turned on its side", async () => {
    const user = userEvent.setup();
    setPhoneViewport(true);
    openShell("/typing");
    await user.type(screen.getByRole("textbox", { name: "Motif" }), "Du 12 au 14");

    act(() => setPhoneViewport(false));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Motif" })).toHaveValue("Du 12 au 14");

    act(() => setPhoneViewport(true));
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Motif" })).toHaveValue("Du 12 au 14");
  });
});
