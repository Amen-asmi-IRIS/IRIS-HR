import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { renderApp } from "@/test/render";
import { setPhoneViewport } from "@/test/viewport";
import { NavList } from "./NavList";

// For these tests the HR desk has its six entries (plans 05 and 06 add Calendar and Reports), My space its five.
vi.mock("@/app/homes", () => ({ HOMES: { hr: () => null, me: () => null } }));
vi.mock("@/workspaces/hr/routes", () => ({
  hrRoutes: ["requests", "employees", "calendar", "reports", "settings"].map((path) => ({ path, element: null })),
}));
vi.mock("@/workspaces/me/routes", () => ({
  meRoutes: ["requests", "calendar", "balance", "profile"].map((path) => ({ path, element: null })),
}));

/** Where the tab bar has led. */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function tabs(route: string, workspace: "hr" | "me" = "hr") {
  setPhoneViewport(true);
  renderApp(
    <>
      <NavList workspace={workspace} variant="tabs" />
      <Where />
    </>,
    { route, path: `/${workspace}/*` },
  );
  return screen.getByRole("navigation", { name: /Navigation/ });
}

describe("the phone tab bar of a workspace with more than five entries", () => {
  it("shows the first four entries and More, which lists the others with their full labels", async () => {
    const user = userEvent.setup();
    const bar = tabs("/hr");
    expect(within(bar).getAllByRole("link").map((link) => link.textContent)).toEqual(["Bureau", "Demandes", "Employés", "Calendrier"]);
    const more = within(bar).getByRole("button", { name: "Plus" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const list = await screen.findByRole("dialog", { name: "Plus" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Rapports", "/hr/reports"],
      ["Configuration", "/hr/settings"],
    ]);
    for (const link of links) expect(link).toHaveClass("min-h-11");
  });

  it("says so in English too", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    const bar = tabs("/hr");
    expect(within(bar).getAllByRole("link").map((link) => link.textContent)).toEqual(["Desk", "Requests", "Employees", "Calendar"]);
    await user.click(within(bar).getByRole("button", { name: "More" }));
    const list = await screen.findByRole("dialog", { name: "More" });
    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual(["Reports", "Settings"]);
  });

  it("closes on Escape and gives the focus back to More", async () => {
    const user = userEvent.setup();
    const bar = tabs("/hr");
    const more = within(bar).getByRole("button", { name: "Plus" });
    await user.click(more);
    const list = await screen.findByRole("dialog", { name: "Plus" });
    await waitFor(() => expect(list).toContainElement(document.activeElement as HTMLElement));
    // The focus stays in the list while it is open.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(list).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Plus" })).not.toBeInTheDocument());
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when an entry is chosen, goes there, and gives the focus back to More", async () => {
    const user = userEvent.setup();
    const bar = tabs("/hr");
    const more = within(bar).getByRole("button", { name: "Plus" });
    await user.click(more);
    await user.click(within(await screen.findByRole("dialog", { name: "Plus" })).getByRole("link", { name: "Configuration" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Plus" })).not.toBeInTheDocument());
    expect(screen.getByTestId("where")).toHaveTextContent("/hr/settings");
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-current", "true");
  });

  it("marks More as the current tab when the page is one of the entries behind it", () => {
    const bar = tabs("/hr/settings/holidays");
    expect(within(bar).getByRole("button", { name: "Plus" })).toHaveAttribute("aria-current", "true");
    for (const link of within(bar).getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });

  it("does not mark More when the page is one of the four tabs", () => {
    const bar = tabs("/hr/employees");
    expect(within(bar).getByRole("button", { name: "Plus" })).not.toHaveAttribute("aria-current");
    expect(within(bar).getByRole("link", { name: "Employés" })).toHaveAttribute("aria-current", "page");
  });
});

describe("the phone tab bar of a workspace with five entries", () => {
  it("shows the five entries and no More", () => {
    const bar = tabs("/me", "me");
    expect(within(bar).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Accueil",
      "Demandes",
      "Calendrier",
      "Solde",
      "Profil",
    ]);
    expect(within(bar).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the desktop sidebar", () => {
  it("lists all six entries of the HR desk", () => {
    renderApp(<NavList workspace="hr" variant="sidebar" />, { route: "/hr", path: "/hr/*" });
    const nav = screen.getByRole("navigation", { name: /Navigation/ });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
    expect(within(nav).queryByRole("button")).not.toBeInTheDocument();
  });
});
