import { describe, expect, it } from "vitest";
import { awayWithData, networkProblem, problemFromBody, ProblemError } from "./problem";

describe("problemFromBody", () => {
  it("reads the problem-details format of the API", () => {
    const problem = problemFromBody(400, {
      type: "urn:iris-hr:problem:accounts.email_taken",
      title: "Bad Request",
      status: 400,
      code: "accounts.email_taken",
      detail: "Cette adresse est déjà utilisée.",
      errors: [{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }],
      request_id: "req-42",
    });
    expect(problem).toBeInstanceOf(ProblemError);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("accounts.email_taken");
    expect(problem.detail).toBe("Cette adresse est déjà utilisée.");
    expect(problem.errors).toEqual([{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }]);
    expect(problem.requestId).toBe("req-42");
    expect(problem.unavailable).toBe(false);
  });

  it("treats a gateway answer that is not a problem as 'unavailable'", () => {
    for (const status of [502, 503, 504]) {
      const problem = problemFromBody(status, "<html>Bad gateway</html>");
      expect(problem.code).toBe("core.unavailable");
      expect(problem.unavailable).toBe(true);
    }
  });

  it("falls back to 'unexpected' for anything else it cannot read", () => {
    const problem = problemFromBody(500, undefined);
    expect(problem.code).toBe("core.unexpected");
    expect(problem.errors).toEqual([]);
    expect(problem.unavailable).toBe(false);
  });

  it("ignores malformed entries in errors", () => {
    const problem = problemFromBody(400, { code: "x.y", detail: "d", errors: [null, { nope: 1 }, { code: "x.y", field: 3 }] });
    expect(problem.errors).toEqual([{ field: null, code: "x.y", detail: "", params: {} }]);
  });
});

describe("awayWithData", () => {
  const away = problemFromBody(503, "<html>Service unavailable</html>");

  it("is true for a reading that has its data and then found the application away", () => {
    expect(awayWithData({ data: [], error: away })).toBe(true);
    expect(awayWithData({ data: { count: 0 }, error: networkProblem() })).toBe(true);
  });

  it("is false when there is nothing to show yet", () => {
    expect(awayWithData({ data: undefined, error: away })).toBe(false);
  });

  it("is false for any other failure: what is out of reach must not stay on screen", () => {
    expect(awayWithData({ data: [], error: new ProblemError({ status: 403, code: "core.forbidden", detail: "" }) })).toBe(false);
    expect(awayWithData({ data: [], error: new ProblemError({ status: 404, code: "core.not_found", detail: "" }) })).toBe(false);
    expect(awayWithData({ data: [], error: new ProblemError({ status: 500, code: "core.unexpected", detail: "" }) })).toBe(false);
    expect(awayWithData({ data: [], error: new TypeError("x is undefined") })).toBe(false);
    expect(awayWithData({ data: [], error: null })).toBe(false);
  });
});

describe("networkProblem", () => {
  it("has status 0 and counts as unavailable", () => {
    const problem = networkProblem();
    expect(problem.status).toBe(0);
    expect(problem.code).toBe("core.network");
    expect(problem.unavailable).toBe(true);
  });
});
