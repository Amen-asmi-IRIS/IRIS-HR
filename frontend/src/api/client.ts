import createClient, { type Middleware } from "openapi-fetch";
import { fileNameOf, saveBlob } from "@/lib/download";
import { networkProblem, problemFromBody } from "./problem";
import type { paths } from "./schema";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let language = "fr";
let onUnauthorized: () => void = () => {};

export function setApiLanguage(lang: string): void {
  language = lang;
}

/** Called once for every call that answers 401, before the error is thrown. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

function readCookie(name: string): string | null {
  const row = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

/**
 * Django checks X-CSRFToken on every unsafe call, sign-in included. The cookie is set by GET auth/csrf,
 * which is asked the first time the cookie is missing.
 */
async function csrfToken(): Promise<string> {
  const fromCookie = readCookie("csrftoken");
  if (fromCookie) return fromCookie;
  let fromAnswer = "";
  try {
    const response = await fetch(`${window.location.origin}/api/v1/auth/csrf`, { credentials: "same-origin" });
    const body = (await response.json()) as { csrf_token?: string };
    fromAnswer = body.csrf_token ?? "";
  } catch {
    // Unreachable: the call that needs the token fails next and reports it.
  }
  return readCookie("csrftoken") ?? fromAnswer;
}

const headers: Middleware = {
  async onRequest({ request }) {
    request.headers.set("Accept-Language", language);
    if (UNSAFE_METHODS.has(request.method)) {
      request.headers.set("X-CSRFToken", await csrfToken());
    }
    return request;
  },
};

// The origin is spelled out so that the same code runs in the browser and under Node in tests.
// fetch is looked up at each call, not once here: the test server replaces it after this module is loaded.
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  fetch: (request) => globalThis.fetch(request),
});
api.use(headers);

/** Unwraps an openapi-fetch result: the body on success, a thrown ProblemError otherwise. */
export async function call<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await promise;
  } catch {
    throw networkProblem();
  }
  if (result.response.ok) return result.data as T;
  if (result.response.status === 401) onUnauthorized();
  throw problemFromBody(result.response.status, result.error);
}

/**
 * Fetches a file the API serves (an attachment, an export) and hands it to the browser as a download.
 * It fails as `call` does: a session that ended goes through the same handler, a refusal is a ProblemError.
 */
export async function download(path: string): Promise<void> {
  let response: Response;
  try {
    response = await globalThis.fetch(new URL(path, window.location.origin), {
      credentials: "same-origin",
      headers: { "Accept-Language": language },
    });
  } catch {
    throw networkProblem();
  }
  if (!response.ok) {
    if (response.status === 401) onUnauthorized();
    throw problemFromBody(response.status, await response.json().catch(() => undefined));
  }
  saveBlob(await response.blob(), fileNameOf(response.headers.get("Content-Disposition")));
}
