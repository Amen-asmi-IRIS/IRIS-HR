import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import HrSettingsIndexPage from "./HrSettingsIndexPage";

describe("HrSettingsIndexPage", () => {
  it("lists one entry per subject, with what it is for", () => {
    renderApp(<HrSettingsIndexPage />, {
      route: "/hr/settings",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    const entry = screen.getByRole("link", { name: /Départements et postes/ });
    expect(entry).toHaveAttribute("href", "/hr/settings/departments");
    expect(screen.getByText(/Les unités de l'entreprise et les intitulés de poste/)).toBeInTheDocument();
  });
});
