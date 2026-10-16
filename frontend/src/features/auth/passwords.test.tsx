import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import ChangePasswordPage from "./ChangePasswordPage";
import ChooseNewPasswordPage from "./ChooseNewPasswordPage";
import { rememberTemporaryPassword, temporaryPasswordInMemory } from "./session";

const TEMPORARY = "Temp-0001-abcd";
const NEW = "Correct-Horse-42!";
const RULES = "Au moins 12 caractères, pas un mot de passe courant, et sans ressemblance avec votre nom ou votre adresse e-mail.";

const noContent = () => new HttpResponse(null, { status: 204 });
const openChoose = () => renderApp(<ChooseNewPasswordPage />, { route: "/password/new", me: makeMe({ must_change_password: true }) });

describe("ChooseNewPasswordPage", () => {
  it("asks only for the new password while the temporary one is still in memory", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ must_change_password: false }))),
    );
    openChoose();
    expect(screen.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Mot de passe temporaire")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAccessibleDescription(RULES);

    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
    expect(body).toEqual({ current_password: TEMPORARY, new_password: NEW });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Votre mot de passe a été modifié."));
    expect(temporaryPasswordInMemory()).toBeNull();
  });

  it("asks for the temporary password again after a reload", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ must_change_password: false }))),
    );
    openChoose();
    await user.type(screen.getByLabelText("Mot de passe temporaire"), TEMPORARY);
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await screen.findByTestId("elsewhere");
    expect(body).toEqual({ current_password: TEMPORARY, new_password: NEW });
  });

  it("refuses a short password and a different confirmation before calling the API", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const called = vi.fn();
    server.use(
      http.post("/api/v1/auth/password", () => {
        called();
        return noContent();
      }),
    );
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "court");
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), "autre");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Le mot de passe doit comporter au moins 12 caractères.")).toBeInTheDocument();
    expect(screen.getByText("Les deux mots de passe ne sont pas identiques.")).toBeInTheDocument();
    expect(called).not.toHaveBeenCalled();
  });

  it("shows the server's refusal next to the new password and keeps what was typed", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const detail = "Ce mot de passe est trop courant.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.weak_password", detail, [{ field: "new_password" }])));
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "motdepasse1234");
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), "motdepasse1234");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await waitFor(() => expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAccessibleDescription(`${RULES} ${detail}`));
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("motdepasse1234");
  });

  it("shows a refused temporary password above the form when its field is not on the page", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const detail = "Le mot de passe actuel est incorrect.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.wrong_current_password", detail, [{ field: "current_password" }])));
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
  });

  it("sends away a user who has nothing to change", () => {
    renderApp(<ChooseNewPasswordPage />, { route: "/password/new", me: makeMe({ must_change_password: false }) });
    expect(screen.getByTestId("elsewhere")).toHaveTextContent(/^\/$/);
  });

  it("offers to sign out, since nothing else is reachable", async () => {
    server.use(http.post("/api/v1/auth/logout", noContent));
    openChoose();
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(await screen.findByTestId("signed-out")).toBeInTheDocument();
  });
});

describe("ChangePasswordPage", () => {
  it("changes the password, says so and empties the form", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe())),
    );
    renderApp(<ChangePasswordPage />, { route: "/password" });
    expect(screen.getByRole("heading", { level: 1, name: "Changer le mot de passe" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Mot de passe actuel"), "Ancien-Mot-2025!");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Votre mot de passe a été modifié."));
    expect(body).toEqual({ current_password: "Ancien-Mot-2025!", new_password: NEW });
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("");
  });

  it("puts a wrong current password next to its field", async () => {
    const user = userEvent.setup();
    const detail = "Le mot de passe actuel est incorrect.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.wrong_current_password", detail, [{ field: "current_password" }])));
    renderApp(<ChangePasswordPage />, { route: "/password" });
    await user.type(screen.getByLabelText("Mot de passe actuel"), "Faux-Mot-2025!");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    await waitFor(() => expect(screen.getByLabelText("Mot de passe actuel")).toHaveAccessibleDescription(detail));
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue(NEW);
  });
});
