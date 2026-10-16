import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import KpmgExportPage from "./KpmgExportPage";

/**
 * What the browser was given to save. The file is fetched by `download` of the API client, which saves it under the
 * name the API gives (plan 02's review); jsdom has no object URLs and follows no link, as in DownloadLink.test.tsx.
 */
const saveBlob = vi.fn();
let last: Blob | null = null;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const hr = makeMe({ roles: ["employee", "hr"] });
let asked: URL[] = [];

function show() {
  renderApp(<KpmgExportPage />, { route: "/hr/reports/kpmg", me: hr });
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01"));
}

beforeEach(() => {
  asked = [];
  saveBlob.mockClear();
  last = null;
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      last = blob;
      return "blob:iris/1";
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (last) saveBlob(last, this.download);
  });
  server.use(
    http.get("/api/v1/exports/kpmg/default-period", () =>
      HttpResponse.json({ start: "2026-11-01", end: "2026-11-30", cutoff_day: null }),
    ),
    http.get("/api/v1/report-filters", () =>
      HttpResponse.json({
        scope: "all",
        departments: [{ id: 1, name: "Souscription" }],
        employees: [{ public_id: "e-1", name: "Amal Employee" }],
        actors: [],
        types: [{ code: "sick", name: "Congé maladie" }],
        steps: [],
      }),
    ),
    http.get("/api/v1/exports/kpmg", ({ request }) => {
      asked.push(new URL(request.url));
      const name = `kpmg_${new URL(request.url).searchParams.get("from")}_${new URL(request.url).searchParams.get("to")}.xlsx`;
      return new HttpResponse(new Blob(["workbook"]), {
        headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${name}"` },
      });
    }),
  );
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("KpmgExportPage", () => {
  it("opens on the proposed period", async () => {
    show();

    await ready();
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(screen.getByText("Période proposée : le dernier mois terminé.")).toBeInTheDocument();
  });

  it("explains a period that follows the payroll cut-off", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg/default-period", () =>
        HttpResponse.json({ start: "2026-10-26", end: "2026-11-25", cutoff_day: 25 }),
      ),
    );

    show();

    await waitFor(() => expect(screen.getByLabelText("Du")).toHaveValue("2026-10-26"));
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-25");
    expect(screen.getByText(/jusqu'au jour de clôture \(le 25\)/)).toBeInTheDocument();
  });

  it("says that a period not over yet counts the month-end credits due by its end", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg/default-period", () =>
        HttpResponse.json({ start: "2099-11-01", end: "2099-11-30", cutoff_day: null }),
      ),
    );
    show();

    await waitFor(() => expect(screen.getByLabelText("Du")).toHaveValue("2099-11-01"));
    const line = /La période n'est pas terminée : le solde annuel comptera les crédits de fin de mois dus d'ici sa fin/;
    expect(screen.getByText(line)).toBeInTheDocument();

    // A period that is over is read as the ledger has it: nothing to say.
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2020-11-01" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2020-11-30" } });
    await waitFor(() => expect(screen.getByLabelText("Au")).toHaveValue("2020-11-30"));
    expect(screen.queryByText(line)).not.toBeInTheDocument();
  });

  it("states the ten columns of the file and the three rules", () => {
    show();

    const columns = within(screen.getByRole("list", { name: "Colonnes du fichier" })).getAllByRole("listitem");
    expect(columns.map((item) => item.textContent)).toEqual([
      "Matricule",
      "Nom",
      "Département",
      "Congé annuel (jours)",
      "Congé maladie (jours)",
      "Congé exceptionnel (jours)",
      "Permissions (heures)",
      "Télétravail (jours)",
      "Solde annuel en fin de période",
      "Tickets restaurant",
    ]);
    const rules = within(screen.getByRole("list", { name: "Règles appliquées" })).getAllByRole("listitem");
    expect(rules).toHaveLength(3);
    expect(rules[0]).toHaveTextContent("Seules les demandes approuvées sont comptées.");
    expect(rules[1]).toHaveTextContent("Les jours situés hors de la période sont exclus.");
    expect(rules[2]).toHaveTextContent(/moins un par jour ouvré entier d'absence/);
  });

  it("has one primary action and keeps the type filter one step away", () => {
    show();

    expect(screen.getAllByRole("button", { name: "Exporter vers Excel" })).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Département" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Salarié" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plus de filtres" })).toBeInTheDocument();
  });

  it("exports the selection in one click and says so", async () => {
    const user = userEvent.setup();
    show();
    await ready();

    await user.selectOptions(screen.getByRole("combobox", { name: "Département" }), "1");
    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByText("Le fichier a été téléchargé.")).toBeInTheDocument();
    expect(asked).toHaveLength(1);
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      department: "1",
    });
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "kpmg_2026-11-01_2026-11-30.xlsx");
  });

  it("says when there is nothing to export", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.nothing_to_export", "Élargissez la période ou retirez un filtre."),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();

    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByText("Rien à exporter pour cette sélection.")).toBeInTheDocument();
    expect(screen.getByText("Élargissez la période ou retirez un filtre.")).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(screen.queryByText("Le fichier a été téléchargé.")).not.toBeInTheDocument();
  });

  it("explains a refused period under the filters and keeps what was chosen", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.period_order", "La date de fin précède la date de début.", [{ field: "to" }]),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();

    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("forgets a refusal as soon as the selection changes", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.nothing_to_export", "Élargissez la période ou retirez un filtre."),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();
    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));
    await screen.findByText("Rien à exporter pour cette sélection.");

    await user.selectOptions(screen.getByRole("combobox", { name: "Salarié" }), "e-1");

    expect(screen.queryByText("Rien à exporter pour cette sélection.")).not.toBeInTheDocument();
  });
});
