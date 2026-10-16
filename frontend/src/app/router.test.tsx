import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMe, makePage, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { AppProviders } from "./providers";
import { routes } from "./router";

// Administration has a home and one page that reads the API; the other workspaces are empty.
vi.mock("@/app/homes", () => ({ HOMES: { admin: () => <p>Accueil de l'administration</p> } }));
vi.mock("@/workspaces/admin/routes", async () => {
  const { createElement } = await import("react");
  const { useQuery } = await import("@tanstack/react-query");
  const { api, call } = await import("@/api/client");
  function AccountsProbe() {
    const query = useQuery({ queryKey: ["accounts", "probe"], queryFn: () => call(api.GET("/api/v1/accounts")), retry: false });
    return <p>{query.isSuccess ? "Liste des comptes" : "Lecture des comptes"}</p>;
  }
  // Not JSX: this line runs while the file's imports are still loading, before the JSX runtime is there.
  return { adminRoutes: [{ path: "accounts", element: createElement(AccountsProbe) }] };
});

function openApp(address: string) {
  const queryClient = makeTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [address] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, address: () => router.state.location.pathname + router.state.location.search };
}

const sysadmin = makeMe({ last_workspace: "admin" });
const signedInAs = (me = sysadmin) => http.get("/api/v1/auth/me", () => HttpResponse.json(me));
const nobody = () => http.get("/api/v1/auth/me", () => problemResponse(401, "core.not_authenticated", "Connectez-vous."));
const accountsOk = () => http.get("/api/v1/accounts", () => HttpResponse.json(makePage([])));

describe("the application", () => {
  afterEach(() => vi.useRealTimers());

  it("sends an anonymous visitor to Sign in, remembering the page", async () => {
    server.use(nobody());
    const app = openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login?next=%2Fadmin%2Faccounts");
  });

  it("lands a System Administrator on Administration", async () => {
    server.use(signedInAs());
    const app = openApp("/");
    expect(await screen.findByText("Accueil de l'administration")).toBeInTheDocument();
    expect(app.address()).toBe("/admin");
    expect(screen.getByRole("link", { name: "État" })).toHaveAttribute("aria-current", "page");
  });

  it("tells a person without any workspace who to ask", async () => {
    server.use(signedInAs(makeMe({ roles: [] })));
    openApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Rien ici pour l'instant" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("keeps a temporary-password user on 'choose a new password'", async () => {
    server.use(signedInAs(makeMe({ must_change_password: true })));
    const app = openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe" })).toBeInTheDocument();
    expect(app.address()).toBe("/password/new");
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("shows 'not available' inside the shell for an address that does not exist", async () => {
    server.use(signedInAs());
    openApp("/nowhere/at/all");
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comptes" })).toBeInTheDocument();
  });

  it("shows 'not available' for the workspace of another role", async () => {
    server.use(signedInAs());
    openApp("/hr");
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
  });

  it("returns to the page, with its filters, after the session ended", async () => {
    const user = userEvent.setup();
    server.use(
      signedInAs(),
      http.get("/api/v1/accounts", () => problemResponse(401, "core.not_authenticated", "Votre session a expiré.")),
    );
    const app = openApp("/admin/accounts?state=locked");
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");

    server.use(
      http.post("/api/v1/auth/login", () => HttpResponse.json(sysadmin)),
      accountsOk(),
    );
    await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), "sysadmin@impactrisks.com");
    await user.type(screen.getByLabelText("Mot de passe"), "Correct-Horse-42!");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Liste des comptes")).toBeInTheDocument();
    expect(app.address()).toBe("/admin/accounts?state=locked");
  });

  it("returns to the page, with its filters, when a call made on a timer finds the session ended", async () => {
    // The page was left open and untouched. The calls it makes by itself do not keep the session alive,
    // so after two hours the bell's next count is the call that answers 401.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let counted = 0;
    let sessionEnded = false;
    server.use(
      signedInAs(),
      accountsOk(),
      http.get("/api/v1/notifications/unread-count", () => {
        counted += 1;
        return sessionEnded ? problemResponse(401, "core.not_authenticated", "Votre session a expiré.") : HttpResponse.json({ count: 0 });
      }),
    );
    const app = openApp("/admin/accounts?state=locked");
    expect(await screen.findByText("Liste des comptes")).toBeInTheDocument();
    await waitFor(() => expect(counted).toBe(1));

    sessionEnded = true;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(counted).toBe(2);
    expect(app.address()).toBe("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");

    sessionEnded = false;
    server.use(http.post("/api/v1/auth/login", () => HttpResponse.json(sysadmin)));
    await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), "sysadmin@impactrisks.com");
    await user.type(screen.getByLabelText("Mot de passe"), "Correct-Horse-42!");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Liste des comptes")).toBeInTheDocument();
    expect(app.address()).toBe("/admin/accounts?state=locked");
  });

  it("signs out from the menu and asks for no return", async () => {
    const user = userEvent.setup();
    server.use(
      signedInAs(),
      accountsOk(),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    const app = openApp("/admin/accounts");
    await user.click(await screen.findByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login");
  });

  it("says 'being updated' when the application is away", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html>Bad gateway</html>", { status: 502 })));
    openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
  });
});
