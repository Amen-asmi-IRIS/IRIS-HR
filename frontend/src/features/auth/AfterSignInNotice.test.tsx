import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { AfterSignInNotice } from "./AfterSignInNotice";
import { markSignedIn, signInNoticePending } from "./session";

const text = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("AfterSignInNotice", () => {
  it("shows the previous sign-in, and who reset the password, once per sign-in", async () => {
    markSignedIn();
    const me = makeMe({
      previous_login_at: "2026-10-04T08:15:00+01:00",
      password_reset: { by: "Samia Admin", at: "2026-10-05T09:00:00+01:00" },
    });
    const first = renderApp(<AfterSignInNotice />, { me });
    const notice = screen.getByRole("complementary", { name: "À propos de votre connexion" });
    expect(text(notice)).toContain("Connexion précédente : 4 oct. 2026 à 08:15.");
    expect(text(notice)).toContain("Votre mot de passe a été réinitialisé par Samia Admin le 5 oct. 2026 à 09:00.");
    expect(signInNoticePending()).toBe(false);

    first.unmount();
    renderApp(<AfterSignInNotice />, { me });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("still says that the password was reset when the name of who did it is not known", () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />, { me: makeMe({ password_reset: { by: null, at: "2026-10-05T09:00:00+01:00" } }) });
    expect(text(screen.getByRole("complementary"))).toContain("Votre mot de passe a été réinitialisé le 5 oct. 2026 à 09:00.");
  });

  it("says so on a first sign-in", () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />, { me: makeMe({ previous_login_at: null }) });
    expect(screen.getByRole("complementary")).toHaveTextContent("C'est votre première connexion.");
  });

  it("can be closed", async () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />);
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows nothing on a page load without a sign-in", () => {
    renderApp(<AfterSignInNotice />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
