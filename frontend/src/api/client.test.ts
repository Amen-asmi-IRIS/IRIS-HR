import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { api, call, setApiLanguage, setUnauthorizedHandler } from "./client";
import { ProblemError } from "./problem";

const noContent = () => new HttpResponse(null, { status: 204 });

beforeEach(() => {
  document.cookie = "csrftoken=abc123; path=/";
  setApiLanguage("fr");
  setUnauthorizedHandler(() => {});
});

describe("api client", () => {
  it("sends the language and the CSRF token on an unsafe method", async () => {
    let seen: Headers | undefined;
    server.use(
      http.post("/api/v1/auth/logout", ({ request }) => {
        seen = request.headers;
        return noContent();
      }),
    );
    await call(api.POST("/api/v1/auth/logout"));
    expect(seen?.get("x-csrftoken")).toBe("abc123");
    expect(seen?.get("accept-language")).toBe("fr");
  });

  it("does not send the CSRF token on a read", async () => {
    let seen: Headers | undefined;
    server.use(
      http.get("/api/v1/notifications/unread-count", ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ count: 2 });
      }),
    );
    const body = await call(api.GET("/api/v1/notifications/unread-count"));
    expect(body.count).toBe(2);
    expect(seen?.get("x-csrftoken")).toBeNull();
  });

  it("asks for the CSRF cookie before the first unsafe call, sign-in included", async () => {
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    const order: string[] = [];
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/auth/csrf", () => {
        order.push("csrf");
        // The browser stores the cookie the API sets; the test does it by hand.
        document.cookie = "csrftoken=fresh; path=/";
        return HttpResponse.json({ csrf_token: "fresh" });
      }),
      http.post("/api/v1/auth/login", ({ request }) => {
        order.push("login");
        seen = request.headers.get("x-csrftoken");
        return HttpResponse.json({});
      }),
    );
    await call(api.POST("/api/v1/auth/login", { body: { email: "a@impactrisks.com", password: "x" } }));
    expect(order).toEqual(["csrf", "login"]);
    expect(seen).toBe("fresh");
  });

  it("falls back on the token in the answer when the cookie cannot be read", async () => {
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/auth/csrf", () => HttpResponse.json({ csrf_token: "from-the-answer" })),
      http.post("/api/v1/auth/logout", ({ request }) => {
        seen = request.headers.get("x-csrftoken");
        return noContent();
      }),
    );
    await call(api.POST("/api/v1/auth/logout"));
    expect(seen).toBe("from-the-answer");
  });

  it("throws a ProblemError carrying the fields", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json(
          {
            type: "urn:iris-hr:problem:auth.invalid_credentials",
            title: "Bad Request",
            status: 400,
            code: "auth.invalid_credentials",
            detail: "Adresse ou mot de passe incorrect.",
            errors: [{ field: null, code: "auth.invalid_credentials", detail: "Adresse ou mot de passe incorrect.", params: {} }],
            request_id: "req-1",
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const error = await call(api.POST("/api/v1/auth/login", { body: { email: "a@impactrisks.com", password: "x" } })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).code).toBe("auth.invalid_credentials");
    expect((error as ProblemError).requestId).toBe("req-1");
  });

  it("tells the application when a call answers 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get("/api/v1/notifications/unread-count", () =>
        HttpResponse.json({ code: "core.not_authenticated", detail: "Connectez-vous.", errors: [], request_id: "r" }, { status: 401 }),
      ),
    );
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect((error as ProblemError).status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("reports the application as unavailable when the proxy answers with a page", async () => {
    server.use(http.get("/api/v1/notifications/unread-count", () => new HttpResponse("<html>…</html>", { status: 503, headers: { "Content-Type": "text/html" } })));
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect((error as ProblemError).unavailable).toBe(true);
    expect((error as ProblemError).code).toBe("core.unavailable");
  });

  it("reports a failed connection as unavailable", async () => {
    server.use(http.get("/api/v1/notifications/unread-count", () => HttpResponse.error()));
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).status).toBe(0);
    expect((error as ProblemError).unavailable).toBe(true);
  });
});
