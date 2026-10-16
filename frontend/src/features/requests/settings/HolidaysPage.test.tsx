import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeHoliday, problemResponse } from "@/features/requests/fixtures";
import { todayISO } from "@/lib/dates";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { HolidayImpact } from "../types";
import HolidaysPage from "./HolidaysPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const COVERED: HolidayImpact[] = [
  { public_id: "req-1", employee: "Amal Trabelsi", type: "Congé annuel", start_date: "2026-11-09", end_date: "2026-11-11", quantity: "3.00" },
];
const WARNING = "Des demandes déjà approuvées couvrent ce jour. Leur décompte ne change pas :";

function serve(impact: HolidayImpact[] = []) {
  const calls = {
    years: [] as string[],
    impactDates: [] as string[],
    created: [] as unknown[],
    updated: [] as { id: string; body: unknown }[],
    deleted: [] as string[],
    copied: [] as unknown[],
  };
  server.use(
    http.get("/api/v1/holidays", ({ request }) => {
      calls.years.push(new URL(request.url).searchParams.get("year") ?? "");
      return HttpResponse.json([
        makeHoliday({ id: 3, date: "2026-03-31", name: "Aïd el-Fitr", name_fr: "Aïd el-Fitr", name_en: "Eid al-Fitr", recurs_yearly: false }),
        makeHoliday(),
      ]);
    }),
    http.get("/api/v1/holidays/impact", ({ request }) => {
      calls.impactDates.push(new URL(request.url).searchParams.get("date") ?? "");
      return HttpResponse.json(impact);
    }),
    http.post("/api/v1/holidays", async ({ request }) => {
      calls.created.push(await request.json());
      return HttpResponse.json(makeHoliday({ id: 9 }), { status: 201 });
    }),
    http.patch("/api/v1/holidays/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(makeHoliday());
    }),
    http.delete("/api/v1/holidays/:id", ({ params }) => {
      calls.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/holidays/copy", async ({ request }) => {
      calls.copied.push(await request.json());
      return HttpResponse.json([makeHoliday({ id: 11, date: "2027-05-01" }), makeHoliday({ id: 12, date: "2027-07-25" })], { status: 201 });
    }),
  );
  return calls;
}

const open = (route = "/hr/settings/holidays?year=2026", readOnly = false) =>
  renderApp(<HolidaysPage readOnly={readOnly} />, { route, path: "/hr/settings/holidays", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, public holidays (UI 7.12, ADM-04)", () => {
  it("lists the holidays of the year with their date, name and recurrence", async () => {
    const calls = serve();
    open();
    const labour = await rowOf(/Fête du travail/);
    expect(labour.getByText("D(2026-05-01)")).toBeInTheDocument();
    expect(labour.getByText("Chaque année, à la même date")).toBeInTheDocument();
    expect((await rowOf(/Aïd el-Fitr/)).getByText("Cette année seulement")).toBeInTheDocument();
    expect(screen.getByLabelText("Année")).toHaveValue("2026");
    expect(calls.years).toEqual(["2026"]);
  });

  it("starts on the current year and changes year", async () => {
    const calls = serve();
    open("/hr/settings/holidays");
    const thisYear = Number(todayISO().slice(0, 4));
    await rowOf(/Fête du travail/);
    expect(calls.years).toEqual([String(thisYear)]);
    await chooseOption("Année", String(thisYear + 1));
    await waitFor(() => expect(calls.years.at(-1)).toBe(String(thisYear + 1)));
  });

  it("adds a holiday, and warns about the approved requests that cover the day", async () => {
    const calls = serve(COVERED);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    setDate("Date", "2026-11-10", inSheet);
    expect(await inSheet.findByText(WARNING)).toBeInTheDocument();
    expect(inSheet.getByText("Amal Trabelsi · Congé annuel · R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(calls.impactDates).toEqual(["2026-11-10"]);
    setText("Nom en français", "Jour exceptionnel", inSheet);
    setText("Nom en anglais", "Special day", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.created).toEqual([
        { date: "2026-11-10", name_fr: "Jour exceptionnel", name_en: "Special day", recurs_yearly: false },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Jour férié enregistré.");
  });

  it("shows no warning when no approved request covers the day", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    setDate("Date", "2026-11-10", inSheet);
    await waitFor(() => expect(calls.impactDates).toEqual(["2026-11-10"]));
    expect(inSheet.queryByRole("status")).not.toBeInTheDocument();
  });

  it("changes a holiday; a moved date warns about the new day and about the former one", async () => {
    const calls = serve(COVERED);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "D(2026-05-01)" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Modifier : Fête du travail" }));
    expect(inSheet.getByLabelText("Nom en anglais")).toHaveValue("Labour Day");
    // Nothing changes yet: nothing to warn about.
    expect(inSheet.queryByRole("status")).not.toBeInTheDocument();
    setDate("Date", "2026-05-04", inSheet);
    expect(await inSheet.findByText(WARNING)).toBeInTheDocument();
    expect(
      await inSheet.findByText("Des demandes déjà approuvées couvrent l'ancienne date. Leur décompte ne change pas :"),
    ).toBeInTheDocument();
    expect([...calls.impactDates].sort()).toEqual(["2026-05-01", "2026-05-04"]);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.updated).toEqual([
        { id: "1", body: { date: "2026-05-04", name_fr: "Fête du travail", name_en: "Labour Day", recurs_yearly: true } },
      ]),
    );
  });

  it("removes a holiday after stating the consequence and who is affected", async () => {
    const calls = serve(COVERED);
    open();
    const labour = await rowOf(/Fête du travail/);
    await userEvent.click(labour.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Supprimer ce jour férié ?" });
    expect(
      await within(dialog).findByText(
        "Le D(2026-05-01) redevient un jour ouvré pour les demandes à venir. Des demandes déjà approuvées couvrent ce jour et leur décompte ne change pas : Amal Trabelsi.",
      ),
    ).toBeInTheDocument();
    expect(calls.deleted).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer le jour férié" }));
    await waitFor(() => expect(calls.deleted).toEqual(["1"]));
    expect(toast).toHaveBeenCalledWith("Jour férié supprimé.");
  });

  it("copies the fixed-date holidays to the next year", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Copier les jours à date fixe vers 2027" }));
    await waitFor(() => expect(calls.copied).toEqual([{ from_year: 2026, to_year: 2027 }]));
    expect(toast).toHaveBeenCalledWith("Jours fériés copiés vers 2027 : 2.");
  });

  it("shows on the date what the server refuses, and keeps the names", async () => {
    serve();
    server.use(
      http.post("/api/v1/holidays", () =>
        problemResponse(400, "validation", "Un jour férié existe déjà à cette date.", [
          { field: "date", code: "calendar.holiday_exists", detail: "Un jour férié existe déjà à cette date." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(3);
    setDate("Date", "2026-05-01", inSheet);
    setText("Nom en français", "Fête du travail", inSheet);
    setText("Nom en anglais", "Labour Day", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findByText("Un jour férié existe déjà à cette date.")).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Fête du travail");
  });

  it("read-only: the list of the year, and nothing to add, change, copy or remove", async () => {
    serve();
    open("/hr/settings/holidays?year=2026", true);
    await rowOf(/Fête du travail/);
    expect(screen.getByLabelText("Année")).toHaveValue("2026");
    expect(screen.queryByRole("button", { name: "Nouveau jour férié" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "D(2026-05-01)" })).not.toBeInTheDocument();
  });
});
