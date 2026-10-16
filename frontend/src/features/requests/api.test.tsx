import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  makeRequest, makeRequestDetail, makeType, paginated, problemResponse, TYPES,
} from "@/features/requests/fixtures";
import { server } from "@/test/server";
import {
  isConflict, requestsApi, useAttachFile, useDecideStep, useRequestList, useRequestTypes, useSaveTypeSteps,
} from "./api";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe("requests API layer", () => {
  it("sends the scope and only the filters that are set", async () => {
    let search = "";
    server.use(
      http.get("/api/v1/requests", ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
    );
    const { result } = renderHook(
      () => useRequestList({ scope: "mine", status: "approved", type: "", year: "2026", page: 1, page_size: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = new URLSearchParams(search);
    expect(query.get("scope")).toBe("mine");
    expect(query.get("status")).toBe("approved");
    expect(query.get("year")).toBe("2026");
    expect(query.has("type")).toBe(false);
    expect(result.current.data?.results[0].public_id).toBe("req-1");
  });

  it("posts a decision with the version and refreshes every request query", async () => {
    let listCalls = 0;
    let body: unknown;
    server.use(
      http.get("/api/v1/requests", () => {
        listCalls += 1;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
      http.post("/api/v1/steps/7/decide", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
    );
    const { result } = renderHook(() => ({ list: useRequestList({ scope: "team" }), decide: useDecideStep() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => {
      await result.current.decide.mutateAsync({ stepId: 7, body: { decision: "approve", comment: "", version: 3 } });
    });
    expect(body).toEqual({ decision: "approve", comment: "", version: 3 });
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("reports a 409 as a conflict and still refreshes", async () => {
    let listCalls = 0;
    server.use(
      http.get("/api/v1/requests", () => {
        listCalls += 1;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
      http.post("/api/v1/steps/7/decide", () =>
        problemResponse(409, "request.already_processed", "Cette demande a déjà été traitée."),
      ),
    );
    const { result } = renderHook(() => ({ list: useRequestList({ scope: "team" }), decide: useDecideStep() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.decide.mutateAsync({ stepId: 7, body: { decision: "approve", comment: "", version: 3 } });
      } catch (error) {
        caught = error;
      }
    });
    expect(isConflict(caught)).toBe(true);
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("creates a draft, then submits it with the version it received", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/requests", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ public_id: "new-1", version: 4, status: "draft" }), { status: 201 });
      }),
      http.post("/api/v1/requests/new-1/submit", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ public_id: "new-1", version: 5 }));
      }),
    );
    const draft = await requestsApi.create({
      type: "annual",
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
      exceptional_event: null,
      comment: "",
    });
    const sent = await requestsApi.submit(draft.public_id, draft.version);
    expect(bodies[0]).toMatchObject({ type: "annual", start_date: "2026-11-09", end_date: "2026-11-11" });
    expect(bodies[1]).toEqual({ version: 4 });
    expect(sent.version).toBe(5);
  });

  it("uploads a file to the request it belongs to", async () => {
    let uploads = 0;
    server.use(
      http.post("/api/v1/requests/req-1/attachments", () => {
        uploads += 1;
        return HttpResponse.json(
          { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
          { status: 201 },
        );
      }),
    );
    const { result } = renderHook(() => useAttachFile(), { wrapper });
    const file = new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.mutateAsync({ id: "req-1", file });
    });
    expect(uploads).toBe(1);
  });

  it("replaces the steps of a type, in order", async () => {
    let body: unknown;
    server.use(
      http.put("/api/v1/request-types/1/steps", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([]);
      }),
    );
    const { result } = renderHook(() => useSaveTypeSteps(), { wrapper });
    const steps = [
      { approver_rule: "line_manager" as const, named_person: null, mode: "approve" as const, reminder_after_days: 2, flag_after_days: 4 },
      { approver_rule: "hr_role" as const, named_person: null, mode: "approve" as const, reminder_after_days: 2, flag_after_days: 4 },
    ];
    await act(async () => {
      await result.current.mutateAsync({ typeId: 1, steps });
    });
    expect(body).toEqual({ steps });
  });

  it("reads a configuration list whether it arrives bare or paginated", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json(paginated([TYPES.annual, makeType("sick")]))));
    const { result } = renderHook(() => useRequestTypes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((type) => type.code)).toEqual(["annual", "sick"]);
  });
});
