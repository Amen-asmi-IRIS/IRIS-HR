import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/format";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import ActivityLogPage from "./ActivityLogPage";

const hr = makeMe({ roles: ["employee", "hr"] });

const event = {
  id: 1,
  at: "2026-11-13T10:00:00+01:00",
  actor: "Senna RH",
  category: "business",
  action: "request.updated",
  object_type: "request",
  object_id: "0b0e7a52-7f0b-4f0e-9a55-2f2f0f1f9c11",
  object_label: "Congé maladie, Amal Employee",
  changes: {
    comment: { changed: true },
    end_date: { before: "2026-11-13", after: "2026-11-14" },
  },
  ip_address: "10.0.0.5",
  request_id: "req-9",
};

let asked: URLSearchParams[] = [];
const accountsListed = vi.fn();

function show() {
  renderApp(<ActivityLogPage />, { route: "/hr/reports/activity", path: "/hr/reports/activity", me: hr });
}

beforeEach(() => {
  asked = [];
  accountsListed.mockClear();
  server.use(
    http.get("/api/v1/report-filters", () =>
      HttpResponse.json({
        scope: "all",
        departments: [],
        employees: [],
        actors: [{ public_id: "u-9", name: "Senna RH" }],
        types: [],
        steps: [],
      }),
    ),
    http.get("/api/v1/audit/business", ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json(makePage([event]));
    }),
    http.get("/api/v1/accounts", () => {
      accountsListed();
      return HttpResponse.json(makePage([]));
    }),
  );
});

describe("ActivityLogPage", () => {
  it("names what happened instead of showing its code", async () => {
    show();

    const table = await screen.findByRole("table", { name: "Journal d'activité" });
    expect(within(table).getByText("Demande modifiée")).toBeInTheDocument();
    expect(within(table).queryByText("request.updated")).not.toBeInTheDocument();
  });

  it("lets HR filter by person without listing the accounts", async () => {
    const user = userEvent.setup();
    show();

    const who = await screen.findByRole("combobox", { name: "Qui" });
    await waitFor(() => expect(within(who).getByRole("option", { name: "Senna RH" })).toBeInTheDocument());
    await user.selectOptions(who, "u-9");

    await waitFor(() => expect(asked.at(-1)?.get("actor")).toBe("u-9"));
    expect(accountsListed).not.toHaveBeenCalled();
  });

  it("offers the kinds of event and, one step away, the kinds of item", async () => {
    const user = userEvent.setup();
    show();

    const kinds = await screen.findByRole("combobox", { name: "Type d'événement" });
    expect(within(kinds).getByRole("option", { name: "Départ enregistré" })).toBeInTheDocument();
    expect(within(kinds).getByRole("option", { name: "Export KPMG" })).toBeInTheDocument();
    await user.selectOptions(kinds, "export.kpmg");
    await waitFor(() => expect(asked.at(-1)?.get("action")).toBe("export.kpmg"));

    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));
    const items = screen.getByRole("combobox", { name: "Type d'élément" });
    await user.selectOptions(items, "request");
    await waitFor(() => expect(asked.at(-1)?.get("object_type")).toBe("request"));
    expect(within(items).getByRole("option", { name: "Demande" })).toBeInTheDocument();
  });

  it("shows a redacted field as changed, never as a value", async () => {
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: formatDateTime(event.at, "fr") }));

    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("comment");
    expect(sheet).toHaveTextContent("modifié");
    expect(sheet).not.toHaveTextContent("true");
    expect(sheet).not.toHaveTextContent("[object Object]");
  });
});
