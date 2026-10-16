import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { WORKSPACES } from "@/app/workspaces";
import { wasSignedOut } from "@/features/auth/session";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { makeTestQueryClient, renderApp } from "@/test/render";
import { server } from "@/test/server";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavList } from "./NavList";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

// What exists in this test: Administration has a home and two pages, My team and My space one page each.
vi.mock("@/app/homes", () => ({ HOMES: { admin: () => null } }));
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }, { path: "parameters", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [{ path: "people", element: null }] }));
vi.mock("@/workspaces/me/routes", () => ({ meRoutes: [{ path: "profile", element: null }] }));
vi.mock("./workspaceCounts", () => ({ useWorkspaceCounts: () => ({ team: 3 }) }));

const several = makeMe({ name: "Samia Admin", roles: ["employee", "manager", "sysadmin"] });

const patches = (seen: unknown[]) =>
  http.patch("/api/v1/auth/me", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    seen.push(body);
    return HttpResponse.json({ ...several, ...body });
  });

describe("NavList", () => {
  it("shows only the entries that have a page, and marks the current one", () => {
    renderApp(<NavList workspace="admin" variant="sidebar" />, { route: "/admin/accounts" });
    const nav = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["État", "Comptes", "Paramètres"]);
    expect(within(nav).getByRole("link", { name: "Comptes" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "État" })).not.toHaveAttribute("aria-current");
    expect(within(nav).queryByRole("link", { name: "Journal de sécurité" })).not.toBeInTheDocument();
  });

  it("offers the same entries as tabs on a phone", () => {
    renderApp(<NavList workspace="admin" variant="tabs" />, { route: "/admin" });
    const nav = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin", "/admin/accounts", "/admin/parameters"]);
    expect(within(nav).getByRole("link", { name: "État" })).toHaveAttribute("aria-current", "page");
  });

  it("writes an entry's short label in the phone tabs and its full label in the sidebar", () => {
    const { unmount } = renderApp(<NavList workspace="hr" variant="tabs" />, { route: "/hr/settings", path: "/hr/*" });
    expect(screen.getByRole("link", { name: "Réglages" })).toHaveAttribute("href", "/hr/settings");
    expect(screen.queryByRole("link", { name: "Configuration" })).not.toBeInTheDocument();
    unmount();
    renderApp(<NavList workspace="hr" variant="sidebar" />, { route: "/hr/settings", path: "/hr/*" });
    expect(screen.getByRole("link", { name: "Configuration" })).toHaveAttribute("href", "/hr/settings");
    expect(screen.queryByRole("link", { name: "Réglages" })).not.toBeInTheDocument();
  });

  it("has a short label in both languages for every entry that gives one", () => {
    const keys = Object.values(WORKSPACES).flatMap((workspace) => workspace.nav.flatMap((entry) => entry.shortLabelKey ?? []));
    expect(keys.length).toBeGreaterThan(0);
    for (const lang of ["fr", "en"]) {
      for (const key of keys) expect(i18n.exists(key, { lng: lang }), `${lang} ${key}`).toBe(true);
    }
  });
});

describe("WorkspaceSwitcher", () => {
  it("is absent for a person with a single workspace", () => {
    const { container } = renderApp(<WorkspaceSwitcher current="admin" />, { route: "/admin", me: makeMe({ roles: ["sysadmin"] }) });
    expect(container.querySelector("button")).toBeNull();
  });

  it("lists the person's workspaces with what is waiting in each, and switches", async () => {
    const user = userEvent.setup();
    renderApp(<WorkspaceSwitcher current="admin" />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Espace : Administration. 3 en attente dans vos autres espaces" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(["Mon espace", "Mon équipe, 3 en attente", "Administration"]);
    await user.click(screen.getByRole("menuitem", { name: "Mon équipe, 3 en attente" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/team");
  });
});

describe("LanguageSwitch", () => {
  it("changes at once, stores the choice on the account and fetches server texts again", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    server.use(patches(seen));
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(["notifications", "unread-count"], { count: 1 });
    renderApp(<LanguageSwitch />, { route: "/admin", me: several, queryClient });
    const group = screen.getByRole("group", { name: "Langue" });
    expect(within(group).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(group).getByRole("button", { name: "English" }));
    expect(await screen.findByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(i18n.language).toBe("en");
    await waitFor(() => expect(seen).toEqual([{ language: "en" }]));
    await waitFor(() => expect(queryClient.getQueryState(["notifications", "unread-count"])?.isInvalidated).toBe(true));
  });
});

describe("UserMenu", () => {
  it("shows who is signed in and leads to the change of password", async () => {
    const user = userEvent.setup();
    renderApp(<UserMenu />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Samia Admin")).toBeInTheDocument();
    expect(within(menu).getByText("sysadmin@impactrisks.com")).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "English" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Changer le mot de passe" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/password");
  });

  it("signs out", async () => {
    const user = userEvent.setup();
    const out = vi.fn();
    server.use(
      http.post("/api/v1/auth/logout", () => {
        out();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<UserMenu />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(await screen.findByTestId("signed-out")).toBeInTheDocument();
    expect(out).toHaveBeenCalledTimes(1);
    expect(wasSignedOut()).toBe(true);
  });

  it("carries the language choice on a phone", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    server.use(patches(seen));
    renderApp(<UserMenu compact withLanguage />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "English" }));
    await waitFor(() => expect(seen).toEqual([{ language: "en" }]));
    expect(i18n.language).toBe("en");
  });
});
