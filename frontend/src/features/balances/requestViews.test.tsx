import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import RequestPage from "@/features/requests/RequestPage";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

/** A pending annual-leave request as its line manager receives it (master 7.9, RequestDetailOut). */
function pendingRequest(balance: { now: string; after: string } | null) {
  return {
    public_id: "abc",
    version: 1,
    employee: { public_id: "e-1", name: "Amel Trabelsi", department: "Souscription" },
    type: { code: "annual", name: "Congé annuel", unit: "day", calendar_label: "absent" },
    start_date: "2026-11-02",
    end_date: "2026-11-04",
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    quantity: "3.00",
    event: null,
    comment: null,
    comment_hidden: false,
    status: "pending",
    state: { key: "waiting_manager", waiting_on: ["Sami Ben Ali"], last_actor: null, note: null, since: "2026-10-28T09:00:00+01:00" },
    certificate: { status: "not_needed", due_at: null },
    amendment: null,
    has_override: false,
    created_by_hr: false,
    viewer: { relation: "approver", actions: ["decide"], step_id: 7 },
    submitted_at: "2026-10-28T09:00:00+01:00",
    decided_at: null,
    created_at: "2026-10-28T08:55:00+01:00",
    steps: [
      { id: 7, round: 1, position: 1, rule: "line_manager", mode: "approve", status: "pending", approvers: ["Sami Ben Ali"], decided_by: null, decided_at: null, recorded_by: null, channel: null, comment: "", amendment_public_id: null },
      { id: 8, round: 1, position: 2, rule: "hr_role", mode: "approve", status: "waiting", approvers: ["Sana Gharbi"], decided_by: null, decided_at: null, recorded_by: null, channel: null, comment: "", amendment_public_id: null },
    ],
    attachments: [],
    amendments: [],
    decision_context: { balance, teammates_away: [], cap: null },
  };
}

function show(balance: { now: string; after: string } | null) {
  server.use(http.get("/api/v1/requests/abc", () => HttpResponse.json(pendingRequest(balance))));
  renderApp(<RequestPage />, { route: "/requests/abc", me });
}

describe("the decision view of a request", () => {
  it("shows the balance now and after once the API returns them", async () => {
    show({ now: "17.50", after: "14.50" });

    await waitFor(() => expect(document.body).toHaveTextContent("17,5"));
    expect(document.body).toHaveTextContent("14,5");
  });

  it("shows no balance figure while the API returns none", async () => {
    show(null);

    await waitFor(() => expect(document.body).toHaveTextContent("Amel Trabelsi"));
    expect(document.body).not.toHaveTextContent("17,5");
    expect(document.body).not.toHaveTextContent("14,5");
  });
});
