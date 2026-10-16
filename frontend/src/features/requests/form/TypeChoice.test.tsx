import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeType, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { TypeChoice } from "./TypeChoice";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const hrefFor = (code: string) => `/me/requests/new?type=${code}`;

describe("New request, step one", () => {
  it("offers each active type with one line saying what it is for", async () => {
    server.use(
      http.get("/api/v1/request-types", () =>
        HttpResponse.json([TYPES.annual, TYPES.sick, makeType("remote", { is_active: false })]),
      ),
    );
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    const annual = await screen.findByRole("link", { name: /Congé annuel/ });
    expect(annual).toHaveAttribute("href", "/me/requests/new?type=annual");
    expect(within(annual).getByText("Vos jours de congé payé.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Congé maladie/ })).toHaveAttribute("href", "/me/requests/new?type=sick");
    expect(screen.queryByRole("link", { name: /Télétravail/ })).not.toBeInTheDocument();
  });

  it("lists the types in the order HR gave them", async () => {
    server.use(
      http.get("/api/v1/request-types", () =>
        HttpResponse.json([makeType("remote", { sort_order: 1 }), makeType("annual", { sort_order: 2 })]),
      ),
    );
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    const links = await screen.findAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/me/requests/new?type=remote",
      "/me/requests/new?type=annual",
    ]);
  });

  it("says so when no type is available", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    expect(await screen.findByText("Aucun type de demande n'est disponible pour le moment.")).toBeInTheDocument();
  });

  it("offers nothing but the choice itself", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([TYPES.annual])));
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    await screen.findByRole("link", { name: /Congé annuel/ });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
