import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeApprovalItem, makeRequestDetail, paginated } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { ApprovalItem } from "../types";
import ToDecidePage from "./ToDecidePage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

const amal = makeApprovalItem({
  waiting_since: "2026-10-28T09:12:00+01:00",
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [
      { name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" },
      { name: "Ines Haddad", label: "remote", start_date: "2026-11-09", end_date: "2026-11-09" },
    ],
    cap: null,
  },
});
const youssef = makeApprovalItem({
  step_id: 12,
  waiting_since: "2026-10-26T08:00:00+01:00",
  via_delegation_from: "Hatem Jlassi",
  request: {
    public_id: "req-9",
    version: 2,
    employee: { public_id: "emp-9", name: "Youssef Ayari", department: "Sinistres" },
    type: { code: "remote", name: "Télétravail", calendar_label: "remote" },
    start_date: "2026-11-03",
    end_date: "2026-11-03",
    quantity: "1.00",
  },
  decision_context: { balance: null, teammates_away: [], cap: { used: "1.00", limit: "2.00" } },
});

function serve(items: ApprovalItem[] = [amal, youssef]) {
  const calls = { searches: [] as URLSearchParams[], decide: [] as { step: string; body: unknown }[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      calls.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(items));
    }),
    http.post("/api/v1/steps/:id/decide", async ({ request, params }) => {
      calls.decide.push({ step: String(params.id), body: await request.json() });
      return HttpResponse.json(makeRequestDetail({ status: "approved" }));
    }),
  );
  return calls;
}

const open = () => renderApp(<ToDecidePage />, { route: "/team", path: "/team", me });

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("My team, To decide (UI 6.1)", () => {
  it("lists what waits for me, the oldest first, with who, type, dates, length and since when", async () => {
    const calls = serve();
    open();
    const items = await screen.findAllByRole("article");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Youssef Ayari, Télétravail",
      "Amal Trabelsi, Congé annuel",
    ]);
    const first = within(items[1]);
    expect(first.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(first.getByText("Congé annuel")).toBeInTheDocument();
    expect(first.getByText("R(2026-11-09..2026-11-11) · 3 j")).toBeInTheDocument();
    expect(first.getByText("En attente depuis le D(2026-10-28T09:12:00+01:00)")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("mine");
  });

  it("shows what is needed to decide without opening: balance after, teammates away, limit", async () => {
    serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.getByText("Solde après : 9.5 j")).toBeInTheDocument();
    expect(
      amalItem.getByText(
        "Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12)) ; Ines Haddad (télétravail, D(2026-11-09))",
      ),
    ).toBeInTheDocument();
    const youssefItem = within(screen.getByRole("article", { name: "Youssef Ayari, Télétravail" }));
    expect(youssefItem.getByText("Limite : 1 j déjà pris sur 2 j")).toBeInTheDocument();
    expect(youssefItem.queryByText(/Solde/)).not.toBeInTheDocument();
  });

  it("says from whom a request reaches me through a delegation", async () => {
    serve();
    open();
    const youssefItem = within(await screen.findByRole("article", { name: "Youssef Ayari, Télétravail" }));
    expect(youssefItem.getByText("Pour le compte de Hatem Jlassi")).toBeInTheDocument();
    const amalItem = within(screen.getByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.queryByText(/Pour le compte de/)).not.toBeInTheDocument();
  });

  it("offers the oldest request as the page's primary action", async () => {
    serve();
    open();
    expect(await screen.findByRole("link", { name: "Décider la plus ancienne" })).toHaveAttribute("href", "/team/requests/req-9");
  });

  it("says there is nothing to decide, and then offers no primary action", async () => {
    serve([]);
    open();
    expect(await screen.findByText("Rien à décider.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Décider la plus ancienne" })).not.toBeInTheDocument();
  });

  it("approves from the list, through the sheet that states the consequence", async () => {
    const calls = serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    await userEvent.click(amalItem.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ step: "7", body: { decision: "approve", comment: "", version: 1 } }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
  });

  it("refuses from the list with a reason", async () => {
    const calls = serve();
    open();
    const youssefItem = within(await screen.findByRole("article", { name: "Youssef Ayari, Télétravail" }));
    await userEvent.click(youssefItem.getByRole("button", { name: "Refuser" }));
    const sheet = await screen.findByRole("dialog", { name: "Refuser la demande" });
    setText("Motif du refus", "Réunion d'équipe ce jour-là", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([
        { step: "12", body: { decision: "reject", comment: "Réunion d'équipe ce jour-là", version: 2 } },
      ]),
    );
  });

  it("opens a request in the team workspace", async () => {
    serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.getByRole("link", { name: "Ouvrir" })).toHaveAttribute("href", "/team/requests/req-1");
  });
});
