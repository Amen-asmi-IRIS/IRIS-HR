import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, makeRequestDetail, type RequestOverrides } from "@/features/requests/fixtures";
import { todayISO } from "@/lib/dates";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { DelegationOffer } from "./DelegationOffer";
import RequestPage from "./RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

/** A day counted from today, as the API writes dates. */
function day(offset: number): string {
  const date = new Date(`${todayISO()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const employee = makeMe({ roles: ["employee"], workspaces: ["me"] });

const approved: RequestOverrides = {
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  start_date: day(5),
  end_date: day(7),
  viewer: { actions: ["amend"] },
};

const show = (overrides: RequestOverrides = {}, me = manager) =>
  renderApp(<DelegationOffer request={makeRequest({ ...approved, ...overrides })} />, { route: "/me", path: "/me", me });
const offer = () => screen.queryByRole("link", { name: "Nommer un délégué pour ces dates" });

describe("the delegation offer (UI 6.6)", () => {
  it("offers a manager whose leave is approved to name a delegate for those dates", () => {
    show();
    expect(offer()).toHaveAttribute("href", `/team/delegations?from=${day(5)}&to=${day(7)}`);
    expect(
      screen.getByText("Pendant cette absence, les demandes de votre équipe peuvent être décidées par un délégué."),
    ).toBeInTheDocument();
  });

  it("starts the delegation today when the leave has begun", () => {
    show({ start_date: day(-1), end_date: day(2) });
    expect(offer()).toHaveAttribute("href", `/team/delegations?from=${todayISO()}&to=${day(2)}`);
  });

  it("offers nothing to someone who has no team", () => {
    show({}, employee);
    expect(offer()).not.toBeInTheDocument();
  });

  const NOT_OFFERED: [string, RequestOverrides][] = [
    ["the leave is not approved yet", { status: "pending", state: { key: "waiting_hr", waiting_on: [] } }],
    ["the request is remote work", { type: { code: "remote", name: "Télétravail", calendar_label: "remote" } }],
    ["the leave is over", { start_date: day(-9), end_date: day(-7) }],
  ];

  it.each(NOT_OFFERED)("offers nothing when %s", (_name, overrides) => {
    show(overrides);
    expect(offer()).not.toBeInTheDocument();
  });

  it("appears on the manager's own request, in its summary", async () => {
    server.use(
      http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(approved))),
      http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    );
    renderApp(<RequestPage />, { route: "/me/requests/req-1", path: "/me/requests/:id", me: manager });
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByRole("link", { name: "Nommer un délégué pour ces dates" })).toBeInTheDocument();
  });
});
