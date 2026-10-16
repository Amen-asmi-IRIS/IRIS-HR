export interface FieldProblem {
  field: string | null;
  code: string;
  detail: string;
  params: Record<string, unknown>;
}

interface ProblemInit {
  status: number;
  code: string;
  detail: string;
  errors?: FieldProblem[];
  requestId?: string;
}

export class ProblemError extends Error {
  status: number;
  code: string;
  detail: string;
  errors: FieldProblem[];
  requestId: string;

  constructor(init: ProblemInit) {
    super(init.detail || init.code);
    this.name = "ProblemError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId ?? "";
  }

  /** The application is down, restarting or out of reach. */
  get unavailable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFieldProblem(value: unknown): FieldProblem | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  return {
    field: typeof value.field === "string" ? value.field : null,
    code: value.code,
    detail: typeof value.detail === "string" ? value.detail : "",
    params: isRecord(value.params) ? value.params : {},
  };
}

export function problemFromBody(status: number, body: unknown): ProblemError {
  if (isRecord(body) && typeof body.code === "string") {
    const errors = Array.isArray(body.errors)
      ? body.errors.map(toFieldProblem).filter((entry): entry is FieldProblem => entry !== null)
      : [];
    return new ProblemError({
      status,
      code: body.code,
      detail: typeof body.detail === "string" ? body.detail : "",
      errors,
      requestId: typeof body.request_id === "string" ? body.request_id : "",
    });
  }
  const code = status === 502 || status === 503 || status === 504 ? "core.unavailable" : "core.unexpected";
  return new ProblemError({ status, code, detail: "" });
}

export function networkProblem(): ProblemError {
  return new ProblemError({ status: 0, code: "core.network", detail: "" });
}

/**
 * For a page that holds a form. A reading that already has its data keeps it, and also carries the failure of a
 * later reading (after a save, on a timer, on returning to the window). When that failure only says that the
 * application is away, the page stays, with what was typed in it:
 *
 *   if (query.error && !awayWithData(query)) throw query.error;
 */
export function awayWithData(query: { data: unknown; error: unknown }): boolean {
  return query.data !== undefined && query.error instanceof ProblemError && query.error.unavailable;
}
