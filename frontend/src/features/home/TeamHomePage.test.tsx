import { act, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { TeamHome } from "./api";
import TeamHomePage from "./TeamHomePage";

// The queue page is plan 03b's and has its own tests; here we check where it sits.
vi.mock("@/features/requests/queues/ToDecidePage", () => ({
  default: () => <section aria-label="File à décider">queue</section>,
}));

type OutPerson = TeamHome["who_is_out"][number];

function person(overrides: Partial<OutPerson> = {}): OutPerson {
  return {
    employee: { public_id: "p1", name: "Sana Trabelsi" }, label: "absent", type_name: "Congé maladie",
    start_date: "2026-11-02", end_date: "2026-11-03", starts_at_midday: false, ends_at_midday: false, today: true,
    waiting: false, ...overrides,
  };
}

function show(data: Partial<TeamHome>) {
  server.use(http.get("/api/v1/home/team", () => HttpResponse.json({ who_is_out: [], people: [], ...data })));
  return renderApp(<TeamHomePage />, { route: "/team", path: "/team", me: makeMe({ roles: ["employee", "manager"] }) });
}

const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("TeamHomePage", () => {
  it("puts the queue first, then who is out", async () => {
    show({ who_is_out: [person()] });

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    const queue = screen.getByRole("region", { name: "File à décider" });
    expect(queue.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(blockTitles()).toEqual(["Absents et télétravail"]);
  });

  it("lists who is out with the type, the dates, today's mark and the half-day", async () => {
    show({ who_is_out: [
      person(),
      person({ employee: { public_id: "p2", name: "Karim Gharbi" }, label: "remote", type_name: "Télétravail",
               start_date: "2026-11-05", end_date: "2026-11-05", starts_at_midday: true, today: false }),
    ] });

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    const [first, second] = within(out).getAllByRole("listitem");
    expect(first).toHaveTextContent("Sana Trabelsi");
    expect(first).toHaveTextContent("Congé maladie, 2 nov. 2026 – 3 nov. 2026");
    expect(first).toHaveTextContent("aujourd'hui");
    expect(second).toHaveTextContent("Karim Gharbi");
    expect(second).toHaveTextContent("Télétravail, 5 nov. 2026 (après-midi)");
    expect(second).not.toHaveTextContent("aujourd'hui");
  });

  it("lists a sick leave that waits for HR as away, and says it is pending", async () => {
    show({ who_is_out: [person({ waiting: true }), person({ employee: { public_id: "p2", name: "Karim Gharbi" } })] });

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    const [waiting, approved] = within(out).getAllByRole("listitem");
    expect(waiting).toHaveTextContent("Congé maladie, 2 nov. 2026 – 3 nov. 2026 · en attente");
    expect(approved).not.toHaveTextContent("en attente");
  });

  it("shrinks an empty Who is out to one line", async () => {
    show({});

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    expect(within(out).getByText("Toute l'équipe est présente ces sept prochains jours.")).toBeInTheDocument();
    expect(blockTitles()).toEqual(["Absents et télétravail"]);
  });

  it("adds no button of its own: the page's one primary action is the queue page's", async () => {
    show({ who_is_out: [person()] });

    await screen.findByRole("region", { name: "Absents et télétravail" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the queue, and a decision sheet open on it, while the application is away", async () => {
    const { queryClient } = show({ who_is_out: [person()] });
    await screen.findByRole("region", { name: "Absents et télétravail" });

    // A later reading of the home (a return to the window) is not answered; the page is then drawn again.
    server.use(http.get("/api/v1/home/team", () => new HttpResponse("<html>Service unavailable</html>", { status: 503 })));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["home", "team"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(["home", "team"])?.status).toBe("error");
    expect(screen.getByRole("region", { name: "File à décider" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Absents et télétravail" })).toBeInTheDocument();
  });
});
