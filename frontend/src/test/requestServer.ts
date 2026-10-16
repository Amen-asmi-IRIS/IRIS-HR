import { http, HttpResponse } from "msw";
import type { Preview, PreviewBody, RequestTypeOut } from "@/features/requests/types";
import { makeEvent, makePreview, makeRequestDetail, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "./server";

export interface FormCalls {
  preview: PreviewBody[];
  create: Record<string, unknown>[];
  update: Record<string, unknown>[];
  submit: Record<string, unknown>[];
  attach: number;
}

export interface FormServerOptions {
  types?: RequestTypeOut[];
  preview?: Preview | ((body: PreviewBody) => Preview);
  /** The request the server holds once created; defaults to a draft "new-1" at version 1. */
  draft?: DetailOverrides;
}

const DRAFT: DetailOverrides = {
  public_id: "new-1",
  status: "draft",
  state: { key: "draft", waiting_on: [] },
  viewer: { actions: ["edit", "submit", "discard"] },
  submitted_at: null,
};

/**
 * Installs the handlers a request form talks to and records what it sends.
 * The version grows by one with every change, as on the real server.
 * A test overrides one handler by calling `server.use` after this function.
 */
export function serveRequestForm(options: FormServerOptions = {}): FormCalls {
  const calls: FormCalls = { preview: [], create: [], update: [], submit: [], attach: 0 };
  const draft: DetailOverrides = { ...DRAFT, ...options.draft };
  const id = draft.public_id ?? "new-1";
  let version = draft.version ?? 1;
  const current = () => makeRequestDetail({ ...draft, version });

  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(options.types ?? Object.values(TYPES))),
    http.get("/api/v1/exceptional-events", () =>
      HttpResponse.json([
        makeEvent(),
        makeEvent({ id: 2, name: "Naissance", name_fr: "Naissance", name_en: "Birth", days_allowed: "2.00", proof_required: false }),
      ]),
    ),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      calls.preview.push(body);
      const preview = options.preview;
      return HttpResponse.json(typeof preview === "function" ? preview(body) : (preview ?? makePreview()));
    }),
    http.post("/api/v1/requests", async ({ request }) => {
      calls.create.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(current(), { status: 201 });
    }),
    http.patch(`/api/v1/requests/${id}`, async ({ request }) => {
      calls.update.push((await request.json()) as Record<string, unknown>);
      version += 1;
      return HttpResponse.json(current());
    }),
    http.get(`/api/v1/requests/${id}`, () => HttpResponse.json(current())),
    http.post(`/api/v1/requests/${id}/attachments`, () => {
      calls.attach += 1;
      version += 1;
      return HttpResponse.json(
        { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post(`/api/v1/requests/${id}/submit`, async ({ request }) => {
      calls.submit.push((await request.json()) as Record<string, unknown>);
      version += 1;
      return HttpResponse.json(makeRequestDetail({ public_id: id, version }));
    }),
  );
  return calls;
}
