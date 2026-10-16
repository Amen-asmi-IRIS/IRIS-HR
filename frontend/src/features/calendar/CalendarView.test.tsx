import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { setPhoneViewport } from "@/test/viewport";

import { CalendarView, type CalendarViewProps } from "./CalendarView";
import { makeEntry, makeFeed } from "./fixtures";
import { fromIso, toIso, type CalendarFeed } from "./model";

const NOVEMBER = fromIso("2026-11-15");

function setup(feed: CalendarFeed | undefined, props: Partial<CalendarViewProps> = {}) {
  const onAnchorChange = vi.fn();
  renderApp(
    <CalendarView feed={feed} isLoading={false} view="month" anchor={NOVEMBER} onAnchorChange={onAnchorChange} {...props} />,
    { route: "/me/calendar", path: "/me/calendar", me: makeMe({ roles: ["employee"] }) },
  );
  return { onAnchorChange };
}

const cell = (name: RegExp) => screen.getByRole("gridcell", { name });

describe("CalendarView, grid", () => {
  it("shows a colleague as absent with no type and no link", () => {
    setup(makeFeed({ entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-03" })] }));

    const tuesday = cell(/^mardi 3 novembre 2026\. Sana Trabelsi, Absent\(e\)$/);
    expect(within(tuesday).getByText("Sana Trabelsi")).toBeInTheDocument();
    expect(within(tuesday).getByText(/Absent\(e\)/)).toBeInTheDocument();
    expect(within(tuesday).queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows my own request with its type, its status and a link to it", () => {
    setup(makeFeed({ entries: [makeEntry({
      employee: { public_id: "me", name: "Amine Jaziri" }, mine: true, start_date: "2026-11-10", end_date: "2026-11-10",
      type_code: "annual", type_name: "Congé annuel", status: "pending", request_public_id: "abc",
    })] }));

    const link = within(cell(/^mardi 10 novembre 2026\. Vous, Congé annuel · en attente$/)).getByRole("link");
    expect(link).toHaveAttribute("href", "/requests/abc");
    expect(link).toHaveTextContent("Vous · Congé annuel · en attente");
  });

  it("never cuts a chip, and draws a waiting request apart from an approved one", () => {
    setup(makeFeed({ entries: [
      makeEntry({ type_code: "annual", type_name: "Congé annuel", status: "pending", request_public_id: "r1",
                  start_date: "2026-11-10", end_date: "2026-11-10", starts_at_midday: true }),
      makeEntry({ type_code: "annual", type_name: "Congé annuel", status: "approved", request_public_id: "r2",
                  start_date: "2026-11-11", end_date: "2026-11-11" }),
    ] }));

    const waiting = screen.getByRole("link", { name: "Sana Trabelsi · Congé annuel (après-midi) · en attente" });
    const approved = screen.getByRole("link", { name: "Sana Trabelsi · Congé annuel" });
    // Cut to the width of a day, the half-day and "en attente" were lost in the month and week views.
    expect(waiting).not.toHaveClass("truncate");
    expect(approved).not.toHaveClass("truncate");
    // Not by a faint dashed border alone: a waiting request is not filled with its type's colour.
    expect(approved).toHaveClass("bg-type-annual-bg");
    expect(waiting).not.toHaveClass("bg-type-annual-bg");
    expect(waiting).toHaveClass("bg-card", "border-dashed", "border-current");
  });

  it("shows two requests of one person that start on the same day", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    setup(makeFeed({ entries: [
      makeEntry({ start_date: "2026-11-10", end_date: "2026-11-10", ends_at_midday: true }),
      makeEntry({ start_date: "2026-11-10", end_date: "2026-11-10", starts_at_midday: true }),
    ] }));

    const tuesday = cell(/^mardi 10 novembre 2026\./);
    expect(within(tuesday).getAllByText(/Absent\(e\)/)).toHaveLength(2);
    const logged = errors.mock.calls.flat().map(String).join(" ");
    errors.mockRestore();
    expect(logged).not.toMatch(/same key/);
  });

  it("says which half of the day", () => {
    setup(makeFeed({ entries: [
      makeEntry({ start_date: "2026-11-04", end_date: "2026-11-04", starts_at_midday: true, label: "remote" }),
      makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, start_date: "2026-11-05", end_date: "2026-11-06", ends_at_midday: true }),
    ] }));

    expect(cell(/^mercredi 4 novembre 2026\. Sana Trabelsi, Télétravail \(après-midi\)$/)).toBeInTheDocument();
    expect(cell(/^jeudi 5 novembre 2026\. Karim Gharbi, Absent\(e\)$/)).toBeInTheDocument();
    expect(cell(/^vendredi 6 novembre 2026\. Karim Gharbi, Absent\(e\) \(matin\)$/)).toBeInTheDocument();
  });

  it("shows a public holiday, and nobody on a holiday or a weekend", () => {
    setup(makeFeed({
      holidays: [{ date: "2026-11-20", name: "Fête nationale" }],
      entries: [makeEntry({ start_date: "2026-11-19", end_date: "2026-11-23" })],
    }));

    expect(cell(/^jeudi 19 novembre 2026\. Sana Trabelsi, Absent\(e\)$/)).toBeInTheDocument();
    const holiday = cell(/^vendredi 20 novembre 2026\. Jour férié : Fête nationale$/);
    expect(within(holiday).getByText("Fête nationale")).toBeInTheDocument();
    expect(within(holiday).queryByText("Sana Trabelsi")).not.toBeInTheDocument();
    expect(cell(/^samedi 21 novembre 2026$/)).toBeInTheDocument();
    expect(cell(/^lundi 23 novembre 2026\. Sana Trabelsi, Absent\(e\)$/)).toBeInTheDocument();
  });

  it("says that nobody is away on a quiet working day", () => {
    setup(makeFeed());
    expect(cell(/^mercredi 4 novembre 2026\. personne d'absent$/)).toBeInTheDocument();
  });

  it("collapses a crowded day in the month view and shows everyone in the week view", () => {
    const crowd = ["Ali", "Bilel", "Chiraz", "Dorra", "Emna"].map((name, index) =>
      makeEntry({ employee: { public_id: `p${index}`, name }, start_date: "2026-11-12", end_date: "2026-11-12" }));

    setup(makeFeed({ entries: crowd }));
    const thursday = cell(/^jeudi 12 novembre 2026\./);
    expect(within(thursday).getAllByText(/Absent\(e\)/)).toHaveLength(3);
    expect(within(thursday).getByText("+ 2 de plus")).toBeInTheDocument();
    expect(thursday).toHaveAccessibleName(/Emna, Absent\(e\)$/);          // the label still names everyone
  });

  it("shows everyone in the week view", () => {
    const crowd = ["Ali", "Bilel", "Chiraz", "Dorra", "Emna"].map((name, index) =>
      makeEntry({ employee: { public_id: `p${index}`, name }, start_date: "2026-11-12", end_date: "2026-11-12" }));

    setup(makeFeed({ entries: crowd }), { view: "week", anchor: fromIso("2026-11-12") });

    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    expect(within(cell(/^jeudi 12 novembre 2026\./)).getAllByText(/Absent\(e\)/)).toHaveLength(5);
  });

  it("names the grid and its weekday columns", () => {
    setup(makeFeed());
    expect(screen.getByRole("grid", { name: "Calendrier, novembre 2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))).toEqual(
      ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });
});

describe("CalendarView, keyboard", () => {
  it("keeps one day in the tab order and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    setup(makeFeed());

    const focusable = screen.getAllByRole("gridcell").filter((item) => item.getAttribute("tabindex") === "0");
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAccessibleName(/^dimanche 15 novembre 2026/);

    focusable[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(cell(/^lundi 16 novembre 2026/)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell(/^lundi 23 novembre 2026/)).toHaveFocus();
    await user.keyboard("{End}");
    expect(cell(/^dimanche 29 novembre 2026/)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(cell(/^lundi 23 novembre 2026/)).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(cell(/^dimanche 15 novembre 2026/)).toHaveFocus();
  });

  it("asks for another period when the keyboard leaves the visible days", async () => {
    const user = userEvent.setup();
    const { onAnchorChange } = setup(makeFeed());

    cell(/^dimanche 15 novembre 2026/).focus();
    await user.keyboard("{PageDown}");

    expect(onAnchorChange).toHaveBeenCalledTimes(1);
    expect(toIso(onAnchorChange.mock.calls[0][0] as Date)).toBe("2026-12-15");
  });

  it("starts a request from a working day with Enter or with the day's button", async () => {
    const user = userEvent.setup();
    const onDayAction = vi.fn();
    setup(makeFeed({ holidays: [{ date: "2026-11-20", name: "Fête nationale" }] }), { onDayAction });

    cell(/^lundi 16 novembre 2026/).focus();
    await user.keyboard("{Enter}");
    expect(onDayAction).toHaveBeenLastCalledWith("2026-11-16");

    await user.click(screen.getByRole("button", { name: "Nouvelle demande le mar. 17 nov." }));
    expect(onDayAction).toHaveBeenLastCalledWith("2026-11-17");

    expect(screen.queryByRole("button", { name: "Nouvelle demande le ven. 20 nov." })).not.toBeInTheDocument();   // holiday
    expect(screen.queryByRole("button", { name: "Nouvelle demande le sam. 21 nov." })).not.toBeInTheDocument();   // weekend
  });

  it("offers no day action when the page gives none", async () => {
    const user = userEvent.setup();
    setup(makeFeed());

    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
    cell(/^lundi 16 novembre 2026/).focus();
    await user.keyboard("{Enter}");            // nothing happens, nothing throws
  });
});

describe("CalendarView, phone and loading", () => {
  it("is an agenda of the days that have something on them", () => {
    setPhoneViewport(true);          // plan 01b's test setup puts the desktop back after each test
    setup(makeFeed({
      holidays: [{ date: "2026-11-20", name: "Fête nationale" }],
      entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-04" })],
    }));

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    const agenda = screen.getByRole("list", { name: "Absences, novembre 2026" });
    expect(within(agenda).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "mardi 3 novembre 2026", "mercredi 4 novembre 2026", "vendredi 20 novembre 2026",
    ]);
    expect(within(agenda).getByText("Jour férié : Fête nationale")).toBeInTheDocument();
  });

  it("says so when the agenda is empty", () => {
    setPhoneViewport(true);          // plan 01b's test setup puts the desktop back after each test
    setup(makeFeed());
    expect(screen.getByText("Personne n'est absent sur cette période.")).toBeInTheDocument();
  });

  it("announces loading before the first feed arrives", () => {
    setup(undefined, { isLoading: true });
    // The page has the toaster's status region too: the loading line is a status of its own.
    expect(screen.getByText("Chargement du calendrier…")).toHaveAttribute("role", "status");
  });
});

describe("CalendarView, working week", () => {
  it("offers a new request on the days HR's working week includes, and on no other", () => {
    const onDayAction = vi.fn();
    setup(makeFeed({ working_week: [1, 2, 3, 4, 7] }), { onDayAction });

    expect(screen.getByRole("button", { name: "Nouvelle demande le dim. 22 nov." })).toBeInTheDocument();          // Sunday, worked
    expect(screen.queryByRole("button", { name: "Nouvelle demande le ven. 20 nov." })).not.toBeInTheDocument();    // Friday, off
    expect(screen.queryByRole("button", { name: "Nouvelle demande le sam. 21 nov." })).not.toBeInTheDocument();    // Saturday, off
  });
});
