import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { problemResponse } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { requestsApi } from "./api";
import type { Translate } from "./platform";
import { byName, details, serverProblems } from "./problems";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));

interface Values {
  comment: string;
  reason: string;
}

async function errorFor(status: number, code: string, errors: { field: string | null; code: string; detail: string; params: Record<string, unknown> }[]) {
  server.use(http.post("/api/v1/requests/req-1/withdraw", () => problemResponse(status, code, errors[0]?.detail ?? "", errors)));
  return requestsApi.withdraw("req-1").catch((error: unknown) => error);
}

describe("server problems on a form", () => {
  it("puts each problem on its field and returns the others", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(400, "validation", [
      { field: "comment", code: "request.comment_required", detail: "Dites ce qu'il faut corriger.", params: {} },
      { field: null, code: "request.type_inactive", detail: "Ce type n'est plus proposé.", params: {} },
    ]);
    const loose = serverProblems(result.current, error, t, byName<Values>(["comment", "reason"]));
    expect(result.current.getFieldState("comment").error?.message).toBe("Dites ce qu'il faut corriger.");
    expect(loose.map((problem) => problem.detail)).toEqual(["Ce type n'est plus proposé."]);
  });

  it("uses a code-to-field table when the server names no field", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(400, "validation", [
      { field: null, code: "request.reason_required", detail: "Le motif est obligatoire.", params: {} },
    ]);
    const resolve = byName<Values>(["comment", "reason"], { "request.reason_required": "reason" });
    expect(serverProblems(result.current, error, t, resolve)).toEqual([]);
    expect(result.current.getFieldState("reason").error?.message).toBe("Le motif est obligatoire.");
  });

  it("turns a conflict into one plain sentence", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(409, "request.already_processed", [
      { field: null, code: "request.already_processed", detail: "Déjà traité.", params: {} },
    ]);
    const loose = serverProblems(result.current, error, t, byName<Values>(["comment", "reason"]));
    expect(details(loose)).toEqual(["Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."]);
  });

  it("turns anything that is not a problem answer into the generic sentence", () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const loose = serverProblems(result.current, new TypeError("Failed to fetch"), t, byName<Values>(["comment", "reason"]));
    expect(details(loose)).toEqual(["Une erreur est survenue. Veuillez réessayer."]);
  });

  it("says so when the application is away", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    server.use(http.post("/api/v1/requests/req-1/withdraw", () => new HttpResponse("Bad Gateway", { status: 502 })));
    const error = await requestsApi.withdraw("req-1").catch((failure: unknown) => failure);
    expect(details(serverProblems(result.current, error, t, byName<Values>(["comment", "reason"])))).toEqual([
      "L'application est en cours de mise à jour. Elle sera de retour dans un instant.",
    ]);
  });
});
