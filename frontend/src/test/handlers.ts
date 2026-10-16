import { http, HttpResponse } from "msw";
import { makeBalance } from "@/features/balances/testing";
import { makeMe } from "./fixtures";

// Answers every page needs, so a test only declares what it is about.
export const handlers = [
  http.get("/api/v1/auth/csrf", () => HttpResponse.json({ csrf_token: "test-csrf-token" })),
  http.get("/api/v1/health", () =>
    HttpResponse.json({ status: "ok", app: "ok", database: "ok", worker: "ok", version: "0.1.0", environment: "development" }),
  ),
  http.get("/api/v1/notifications/unread-count", () => HttpResponse.json({ count: 0 })),
  http.get("/api/v1/notifications", () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
  http.patch("/api/v1/auth/me", async ({ request }) => HttpResponse.json({ ...makeMe(), ...((await request.json()) as object) })),
  // The account form asks which employees have no account (plan 02): by default, none.
  http.get("/api/v1/accounts/candidates", () => HttpResponse.json([])),
  // Each row of My team, People asks how many requests of the person wait (plan 03b): by default, none.
  http.get("/api/v1/requests", () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
  // The record of an employee shows their annual balance among the facts shown first (plan 04).
  http.get("/api/v1/balances/:employeeId", () => HttpResponse.json(makeBalance())),
  // My team's home and its People list read who is out, the delegation and each person's day (plan 05): a quiet team.
  http.get("/api/v1/home/team", () => HttpResponse.json({ who_is_out: [], delegation: null, people: [] })),
  // The workspace switcher shows how many things wait in each workspace (plan 05): nothing, by default.
  http.get("/api/v1/workspaces/summary", () => HttpResponse.json({ me: 0, team: 0, hr: 0, overview: 0, admin: 0 })),
];
