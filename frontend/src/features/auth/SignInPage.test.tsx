import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { temporaryPasswordInMemory } from "./session";
import SignInPage from "./SignInPage";

const EMAIL = "sysadmin@impactrisks.com";
const PASSWORD = "Correct-Horse-42!";

const open = (route = "/login") => renderApp(<SignInPage />, { route, me: null });

async function fillAndSend(user: UserEvent, email = EMAIL, password = PASSWORD) {
  await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), email);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
}

const accepts = (me = makeMe()) => http.post("/api/v1/auth/login", () => HttpResponse.json(me));

describe("SignInPage", () => {
  it("asks for the email, the password and the language, and says who resets passwords", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
    const languages = screen.getByRole("group", { name: "Langue" });
    expect(within(languages).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    expect(within(languages).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Mot de passe oublié ? Demandez à l'administrateur système de le réinitialiser.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("signs in, trims the email and returns to the page that was asked for", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/login", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeMe());
      }),
    );
    open("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");
    await fillAndSend(user, `  ${EMAIL} `);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts?state=locked");
    expect(body).toEqual({ email: EMAIL, password: PASSWORD });
  });

  it("goes to the root, which picks the landing workspace, when no page was asked for", async () => {
    const user = userEvent.setup();
    server.use(accepts());
    open();
    await fillAndSend(user);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
  });

  it.each(["%2F%2Fevil.example", "https%3A%2F%2Fevil.example%2Fx", "%2F%5Cevil.example", "%2Flogin"])(
    "ignores a next address that leaves the application (%s)",
    async (next) => {
      const user = userEvent.setup();
      server.use(accepts());
      open(`/login?next=${next}`);
      await fillAndSend(user);
      expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
    },
  );

  it.each([
    [400, "auth.invalid_credentials", "Adresse ou mot de passe incorrect."],
    [400, "auth.locked", "Compte verrouillé. Réessayez après 14:45."],
    [400, "auth.disabled", "Compte désactivé. Contactez l'administrateur système."],
    [400, "auth.temp_password_expired", "Mot de passe temporaire expiré. Demandez-en un nouveau à l'administrateur système."],
    [429, "auth.rate_limited", "Trop de tentatives depuis ce poste. Réessayez plus tard."],
  ])("shows the server's message for %i %s above the form and keeps what was typed", async (status, code, detail) => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/auth/login", () => problemResponse(status, code, detail)));
    open();
    await fillAndSend(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue(EMAIL);
    expect(screen.getByLabelText("Mot de passe")).toHaveValue(PASSWORD);
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("puts the refusal of another domain next to the email", async () => {
    const user = userEvent.setup();
    const detail = "Seules les adresses @impactrisks.com sont acceptées.";
    server.use(http.post("/api/v1/auth/login", () => problemResponse(400, "auth.domain_not_allowed", detail, [{ field: "email" }])));
    open();
    await fillAndSend(user, "sami@gmail.com");
    expect(await screen.findByRole("textbox", { name: "Adresse e-mail professionnelle", description: detail })).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps what was typed when the application cannot be reached", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/auth/login", () => HttpResponse.error()));
    open();
    await fillAndSend(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("L'application est injoignable. Vérifiez votre connexion et réessayez.");
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue(EMAIL);
    expect(screen.getByLabelText("Mot de passe")).toHaveValue(PASSWORD);
  });

  it("does not call the API while a field is empty", async () => {
    const user = userEvent.setup();
    const called = vi.fn();
    server.use(
      http.post("/api/v1/auth/login", () => {
        called();
        return HttpResponse.json(makeMe());
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(called).not.toHaveBeenCalled();
  });

  it("switches language at once and stores the choice on the account", async () => {
    const user = userEvent.setup();
    let patched: unknown;
    server.use(
      accepts(makeMe({ language: "fr" })),
      http.patch("/api/v1/auth/me", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(makeMe({ language: "en" }));
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Professional email"), EMAIL);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByTestId("elsewhere");
    expect(patched).toEqual({ language: "en" });
    expect(i18n.language).toBe("en");
  });

  it("adopts the account's language when the user did not choose one", async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    server.use(
      accepts(makeMe({ language: "en" })),
      http.patch("/api/v1/auth/me", () => {
        patch();
        return HttpResponse.json(makeMe({ language: "en" }));
      }),
    );
    open();
    await fillAndSend(user);
    await screen.findByTestId("elsewhere");
    expect(i18n.language).toBe("en");
    expect(patch).not.toHaveBeenCalled();
  });

  it("sends a temporary-password user to choose a new one, keeping the password in memory only", async () => {
    const user = userEvent.setup();
    server.use(accepts(makeMe({ must_change_password: true })));
    open("/login?next=%2Fadmin%2Faccounts");
    await fillAndSend(user, EMAIL, "Temp-0001-abcd");
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/password/new");
    expect(temporaryPasswordInMemory()).toBe("Temp-0001-abcd");
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie;
    expect(stored).not.toContain("Temp-0001-abcd");
  });

  it("sends a user who is already signed in away from the page", () => {
    renderApp(<SignInPage />, { route: "/login?next=%2Fadmin%2Faccounts", me: makeMe() });
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/admin/accounts");
  });

  it("marks the test stack", async () => {
    server.use(http.get("/api/v1/health", () => HttpResponse.json({ status: "ok", app: "ok", database: "ok", worker: "ok", version: "0.1.0", environment: "test" })));
    open();
    expect(await screen.findByText("Environnement de test. Ceci n'est pas la production.")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Connexion · IRIS HR"));
  });
});
