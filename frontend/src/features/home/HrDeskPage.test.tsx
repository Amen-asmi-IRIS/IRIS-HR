import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeProfileChange } from "@/features/profile/testing";
import { makeApprovalItem, paginated } from "@/features/requests/fixtures";
import type { ApprovalItem } from "@/features/requests/types";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import HrDeskPage from "./HrDeskPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const DUE = "2026-11-06T09:00:00+01:00";

const leave = makeApprovalItem({
  step_id: 8,
  request: {
    state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
    viewer: { relation: "hr", actions: ["decide"], step_id: 8 },
  },
});

function sick(id: string, name: string, status: "due" | "overdue"): ApprovalItem {
  return makeApprovalItem({
    step_id: Number(id.replace(/\D/g, "")),
    request: {
      public_id: id,
      employee: { public_id: `emp-${id}`, name },
      type: { code: "sick", name: "Congé maladie" },
      start_date: "2026-11-02",
      end_date: "2026-11-03",
      quantity: "2.00",
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status, due_at: DUE },
      viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: Number(id.replace(/\D/g, "")) },
    },
  });
}

const stuck = makeApprovalItem({
  step_id: 30,
  waiting_since: "2026-10-20T09:00:00+01:00",
  request: {
    public_id: "req-7",
    employee: { public_id: "emp-9", name: "Youssef Ayari" },
    state: { key: "waiting_manager", waiting_on: ["Hatem Jlassi"] },
    viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 30 },
  },
});

interface Queues {
  hr?: ApprovalItem[];
  certificates?: ApprovalItem[];
  stuck?: ApprovalItem[];
  changes?: unknown[];
}

function serve(queues: Queues = {}) {
  const seen = { profile: [] as string[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      const queue = new URL(request.url).searchParams.get("queue") as "hr" | "certificates" | "stuck";
      return HttpResponse.json(paginated(queues[queue] ?? []));
    }),
    http.get("/api/v1/profile-changes", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.profile.push(`${params.get("scope")}:${params.get("status")}`);
      return HttpResponse.json(paginated(queues.changes ?? []));
    }),
  );
  return seen;
}

const open = () => renderApp(<HrDeskPage />, { route: "/hr", path: "/hr", me });
const block = async (name: string) => within(await screen.findByRole("region", { name }));

describe("HR desk (UI 7.1)", () => {
  it("answers the four questions: what waits for HR, which certificates, what is stuck, which profile changes", async () => {
    const seen = serve({
      hr: [leave],
      certificates: [sick("req-21", "Karim Mansour", "overdue"), sick("req-22", "Ines Haddad", "due")],
      stuck: [stuck],
      changes: [makeProfileChange()],
    });
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Bureau RH" })).toBeInTheDocument();

    const validate = await block("À valider");
    expect(await validate.findByText("En attente de validation : 1")).toBeInTheDocument();
    expect(validate.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(validate.getByText("Congé annuel · R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(validate.getByText("Aucun document requis")).toBeInTheDocument();

    const certificates = await block("Certificats");
    expect(await certificates.findByText("En retard : 1 · À fournir : 1")).toBeInTheDocument();
    expect(certificates.getByText("Karim Mansour")).toBeInTheDocument();
    expect(certificates.getByText(`En retard, attendu le T(${DUE})`)).toBeInTheDocument();

    const stuckBlock = await block("Bloquées chez un responsable");
    expect(await stuckBlock.findByText("Sans décision : 1")).toBeInTheDocument();
    expect(stuckBlock.getByText("Youssef Ayari")).toBeInTheDocument();
    expect(stuckBlock.getByText("En attente de Hatem Jlassi depuis le D(2026-10-20T09:00:00+01:00)")).toBeInTheDocument();

    const profile = await block("Modifications de profil");
    expect(await profile.findByText("À traiter : 1")).toBeInTheDocument();
    expect(profile.getByText("Amal Employee")).toBeInTheDocument();
    expect(profile.getByText("Proposée le D(2026-10-20T09:30:00+01:00)")).toBeInTheDocument();
    expect(seen.profile).toContain("all:pending");
  });

  it("says in one line that a queue is empty, and then offers no primary action", async () => {
    serve();
    open();
    expect(await screen.findByText("Aucune demande à valider.")).toBeInTheDocument();
    expect(await screen.findByText("Aucun certificat en attente.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune demande bloquée.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune modification de profil à traiter.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Traiter le plus ancien" })).not.toBeInTheDocument();
  });

  it("offers the oldest item of the first queue that is not empty", async () => {
    serve({ hr: [leave], certificates: [sick("req-21", "Karim Mansour", "overdue")], stuck: [stuck] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/requests/req-1");
  });

  it("passes over an empty queue to the next one", async () => {
    serve({ certificates: [sick("req-21", "Karim Mansour", "overdue"), sick("req-22", "Ines Haddad", "due")], stuck: [stuck] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/requests/req-21");
  });

  it("leads to the profile changes when only those wait", async () => {
    serve({ changes: [makeProfileChange()] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/profile-changes");
  });

  it("links each block to its page, the profile changes included", async () => {
    serve();
    open();
    expect(await screen.findByRole("link", { name: "Tout voir : À valider" })).toHaveAttribute("href", "/hr/validate");
    expect(screen.getByRole("link", { name: "Tout voir : Certificats" })).toHaveAttribute("href", "/hr/certificates");
    expect(screen.getByRole("link", { name: "Tout voir : Bloquées chez un responsable" })).toHaveAttribute("href", "/hr/stuck");
    expect(screen.getByRole("link", { name: "Tout voir : Modifications de profil" })).toHaveAttribute("href", "/hr/profile-changes");
  });

  it("shows the three oldest items of a queue and how many wait in all", async () => {
    serve({
      certificates: [
        sick("req-21", "Karim Mansour", "overdue"),
        sick("req-22", "Ines Haddad", "overdue"),
        sick("req-23", "Nour Chaabane", "due"),
        sick("req-24", "Selim Gharsalli", "due"),
      ],
    });
    open();
    const certificates = await block("Certificats");
    expect(await certificates.findByText("En retard : 2 · À fournir : 2")).toBeInTheDocument();
    expect(certificates.getByText("Nour Chaabane")).toBeInTheDocument();
    expect(certificates.queryByText("Selim Gharsalli")).not.toBeInTheDocument();
    expect(certificates.getByRole("link", { name: /Karim Mansour/ })).toHaveAttribute("href", "/hr/requests/req-21");
  });
});
