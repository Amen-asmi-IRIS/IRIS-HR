import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeRequest } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { MeHome } from "./api";
import MeHomePage from "./MeHomePage";

// The sentence itself belongs to plan 03b; here we only check that the home uses it.
vi.mock("@/features/requests/StatusSentence", () => ({
  StatusSentence: ({ request }: { request: { state: { key: string } } }) => <span>sentence:{request.state.key}</span>,
}));

function home(overrides: Partial<MeHome> = {}): MeHome {
  return {
    balance: { current: "20.00", pending: "2.00", approved_upcoming: "1.50", next_credit_amount: "2.50", next_credit_date: "2026-11-30" },
    needs_you: [],
    in_progress: [],
    coming_up: [],
    ...overrides,
  };
}

function show(data: MeHome) {
  server.use(http.get("/api/v1/home/me", () => HttpResponse.json(data)));
  renderApp(<MeHomePage />, { route: "/me", path: "/me", me: makeMe({ roles: ["employee"] }) });
}

const block = (name: string) => screen.findByRole("region", { name });
const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("MeHomePage", () => {
  it("shows the balance as the one figure, with what is held and what is coming", async () => {
    show(home());

    const balance = await block("Solde");
    expect(within(balance).getByText("20 jours")).toBeInTheDocument();
    expect(within(balance).getByText("de congé annuel disponible")).toBeInTheDocument();
    expect(within(balance).getByText("2 jours")).toBeInTheDocument();
    expect(within(balance).getByText("1,5 jour")).toBeInTheDocument();
    expect(within(balance).getByRole("link", { name: "Voir le détail" })).toHaveAttribute("href", "/me/balance");
  });

  it("has New request as its primary action", async () => {
    show(home());
    expect(await screen.findByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
    expect(screen.getByRole("heading", { level: 1, name: "Mon espace" })).toBeInTheDocument();
  });

  it("lists what needs the employee, with the way to act on each", async () => {
    show(home({ needs_you: [
      { kind: "returned", due_at: null, request: makeRequest({
        public_id: "r1", start_date: "2026-11-10", end_date: "2026-11-10", status: "returned",
        state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Choisissez une autre semaine" },
      }) },
      { kind: "certificate_due", due_at: "2026-11-04T08:00:00+01:00", request: makeRequest({
        public_id: "r2", type: { code: "sick", name: "Congé maladie" }, start_date: "2026-11-02", end_date: "2026-11-02",
      }) },
    ] }));

    const needs = await block("À faire");
    expect(within(needs).getByText("Renvoyée : Congé annuel, 10 nov. 2026")).toBeInTheDocument();
    expect(within(needs).getByText("Choisissez une autre semaine")).toBeInTheDocument();
    expect(within(needs).getByRole("link", { name: "Modifier et renvoyer" })).toHaveAttribute("href", "/me/requests/r1/edit");
    expect(within(needs).getByText("Certificat médical à fournir avant le 4 nov. 2026 à 08:00")).toBeInTheDocument();
    expect(within(needs).getByRole("link", { name: "Ajouter le certificat" })).toHaveAttribute("href", "/requests/r2");
  });

  it("has no Needs you block when nothing needs the employee", async () => {
    show(home());
    await block("Solde");
    expect(blockTitles()).toEqual(["Solde", "En cours", "À venir"]);
  });

  it("shows requests in progress with their status sentence and upcoming absences with their length", async () => {
    show(home({
      in_progress: [makeRequest({ public_id: "r3", start_date: "2026-11-17", end_date: "2026-11-18", quantity: "2.00" })],
      coming_up: [
        makeRequest({ public_id: "r4", start_date: "2026-11-24", end_date: "2026-11-25", quantity: "1.50", status: "approved" }),
        makeRequest({ public_id: "r5", type: { code: "permission", name: "Autorisation", unit: "hour", calendar_label: "hidden" },
                      start_date: "2026-11-26", end_date: "2026-11-26", quantity: "2.00", status: "approved" }),
      ],
    }));

    const inProgress = await block("En cours");
    const link = within(inProgress).getByRole("link", { name: /Congé annuel/ });
    expect(link).toHaveAttribute("href", "/requests/r3");
    expect(link).toHaveTextContent("Congé annuel, 17 nov. 2026 – 18 nov. 2026");
    expect(within(inProgress).getByText("sentence:waiting_manager")).toBeInTheDocument();

    const comingUp = await block("À venir");
    expect(within(comingUp).getByRole("link", { name: /Congé annuel/ })).toHaveTextContent("24 nov. 2026 – 25 nov. 2026");
    expect(within(comingUp).getByText("1,5 jour")).toBeInTheDocument();
    expect(within(comingUp).getByText("2 heures")).toBeInTheDocument();
    expect(within(comingUp).queryByText(/sentence:/)).not.toBeInTheDocument();
    expect(blockTitles()).toHaveLength(3);
  });

  it("says which half of the day a half-day request is", async () => {
    show(home({ in_progress: [
      makeRequest({ public_id: "r6", start_date: "2026-11-17", end_date: "2026-11-17", starts_at_midday: true, quantity: "0.50" }),
      makeRequest({ public_id: "r7", start_date: "2026-11-19", end_date: "2026-11-19", ends_at_midday: true, quantity: "0.50" }),
    ] }));

    const [afternoon, morning] = within(await block("En cours")).getAllByRole("link");
    expect(afternoon).toHaveTextContent("Congé annuel, 17 nov. 2026, l'après-midi");
    expect(morning).toHaveTextContent("Congé annuel, 19 nov. 2026, le matin");
  });

  it("renders for a new employee: a zero balance and one line per empty block", async () => {
    show(home({ balance: { current: "0.00", pending: "0.00", approved_upcoming: "0.00", next_credit_amount: null, next_credit_date: null } }));

    expect(within(await block("Solde")).getAllByText("0 jour")).toHaveLength(3);
    expect(within(await block("En cours")).getByText("Aucune demande en cours.")).toBeInTheDocument();
    expect(within(await block("À venir")).getByText("Aucune absence prévue.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
