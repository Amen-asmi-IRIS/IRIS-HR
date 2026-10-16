import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { makeEntry, makeFeed } from "../fixtures";
import type { CalendarFeed } from "../model";
import HrCalendarPage from "./HrCalendarPage";
import MeCalendarPage from "./MeCalendarPage";
import OverviewCalendarPage from "./OverviewCalendarPage";
import TeamCalendarPage from "./TeamCalendarPage";

let seen: Record<string, string>[] = [];

function serve(feed: CalendarFeed) {
  server.use(
    http.get("/api/v1/calendar", ({ request }) => {
      seen.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json(feed);
    }),
    http.get("/api/v1/departments", () => HttpResponse.json([
      { id: 1, code: "FIN", name: "Finance", name_fr: "Finance", name_en: "Finance", is_active: true, employee_count: 3 },
      { id: 2, code: "CLM", name: "Sinistres", name_fr: "Sinistres", name_en: "Claims", is_active: true, employee_count: 4 },
    ])),
  );
}

const detailed = makeFeed({ entries: [
  makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, start_date: "2026-11-03", end_date: "2026-11-03",
              type_code: "sick", type_name: "Congé maladie", status: "approved", request_public_id: "r1" }),
  makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, start_date: "2026-11-10", end_date: "2026-11-10",
              type_code: "annual", type_name: "Congé annuel", status: "pending", request_public_id: "r2" }),
] });

beforeEach(() => { seen = []; });

describe("MeCalendarPage", () => {
  const me = makeMe({ roles: ["employee"] });
  const open = () => renderApp(<MeCalendarPage />, { route: "/me/calendar?date=2026-11-15", path: "/me/calendar", me });

  it("asks for the department scope and nothing else, and shows colleagues as absent", async () => {
    serve(makeFeed({ entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-03" })] }));
    open();

    expect(await screen.findByRole("gridcell", { name: /mardi 3 novembre 2026\. Sana Trabelsi, Absent\(e\)/ })).toBeInTheDocument();
    expect(seen[0]).toEqual({ from: "2026-10-26", to: "2026-12-06", scope: "department" });
    expect(screen.getByRole("heading", { level: 1, name: "Calendrier" })).toBeInTheDocument();
    expect(screen.getByText("Vous voyez les absences approuvées de votre département, sans leur motif.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();          // no filter on this page
  });

  it("has New request as its one primary action and starts a request from a day", async () => {
    const user = userEvent.setup();
    serve(makeFeed());
    open();

    expect(await screen.findByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
    // The header is drawn before the feed arrives; the days come with it.
    await user.click(await screen.findByRole("button", { name: "Nouvelle demande le mar. 17 nov." }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/me/requests/new?start=2026-11-17");
  });

  it("moves to the next period and to the week view, keeping both in the address", async () => {
    const user = userEvent.setup();
    serve(makeFeed());
    const { router } = open();
    await screen.findByRole("grid", { name: "Calendrier, novembre 2026" });

    await user.click(screen.getByRole("button", { name: "Période suivante" }));
    expect(await screen.findByRole("grid", { name: "Calendrier, décembre 2026" })).toBeInTheDocument();
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ from: "2026-11-30", to: "2027-01-03" }));

    await user.click(screen.getByRole("button", { name: "Semaine" }));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ from: "2026-12-14", to: "2026-12-20" }));
    expect(screen.getByRole("button", { name: "Semaine" })).toHaveAttribute("aria-pressed", "true");
    expect(router.state.location.search).toBe("?date=2026-12-15&view=week");
  });
});

describe("TeamCalendarPage", () => {
  const me = makeMe({ roles: ["employee", "manager"] });
  const open = () => renderApp(<TeamCalendarPage />, { route: "/team/calendar?date=2026-11-15", path: "/team/calendar", me });

  it("shows types and pending requests, and filters by person and type without asking the server again", async () => {
    const user = userEvent.setup();
    serve(detailed);
    open();

    expect(await screen.findByRole("link", { name: "Karim Gharbi · Congé annuel · en attente" })).toHaveAttribute("href", "/requests/r2");
    expect(screen.getByRole("link", { name: "Sana Trabelsi · Congé maladie" })).toBeInTheDocument();
    expect(seen[0]).toMatchObject({ scope: "team" });

    await user.selectOptions(screen.getByLabelText("Personne"), "Sana Trabelsi");
    expect(screen.queryByRole("link", { name: /Karim Gharbi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sana Trabelsi/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Personne"), "Tout le monde");
    await user.selectOptions(screen.getByLabelText("Type"), "Congé annuel");
    expect(screen.queryByRole("link", { name: /Sana Trabelsi/ })).not.toBeInTheDocument();
    expect(seen).toHaveLength(1);
  });

  it("has no primary action and no way to start a request", async () => {
    serve(detailed);
    open();
    await screen.findByRole("grid");

    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
  });
});

describe("HrCalendarPage and OverviewCalendarPage", () => {
  const hr = makeMe({ roles: ["employee", "hr"] });

  it("asks for the whole company and sends the department filter to the server", async () => {
    const user = userEvent.setup();
    serve(detailed);
    const { router } = renderApp(<HrCalendarPage />, { route: "/hr/calendar?date=2026-11-15", path: "/hr/calendar", me: hr });
    await screen.findByRole("link", { name: /Karim Gharbi/ });
    expect(seen[0]).toEqual({ from: "2026-10-26", to: "2026-12-06", scope: "company" });

    await user.selectOptions(await screen.findByLabelText("Département"), "Sinistres");
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ scope: "company", department: "2" }));
    expect(router.state.location.search).toContain("department=2");
    expect(screen.getByLabelText("Personne")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);          // type and status are one step away
  });

  it("applies the status kept in the address", async () => {
    serve(detailed);
    renderApp(<HrCalendarPage />, { route: "/hr/calendar?date=2026-11-15&status=pending", path: "/hr/calendar", me: hr });

    expect(await screen.findByRole("link", { name: /Karim Gharbi/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sana Trabelsi/ })).not.toBeInTheDocument();
  });

  it("is the same read-only calendar for an executive", async () => {
    serve(detailed);
    renderApp(<OverviewCalendarPage />, {
      route: "/overview/calendar?date=2026-11-15", path: "/overview/calendar", me: makeMe({ roles: ["employee", "exec"] }),
    });

    expect(await screen.findByRole("link", { name: /Sana Trabelsi · Congé maladie/ })).toBeInTheDocument();
    expect(seen[0]).toMatchObject({ scope: "company" });
    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
  });
});
