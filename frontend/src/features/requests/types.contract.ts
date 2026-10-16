import type { paths } from "@/api/schema";
import type { ApprovalItem, Preview, RequestDetail, RequestOut } from "./types";

/**
 * Fails the type check when the generated API description lacks a field this feature reads.
 * A failure here means a response differs from master plan section 7.9, or that its serializer
 * is not described to drf-spectacular. The fix belongs in the backend (plan 03a), not in types.ts.
 */
type Body<R> = R extends { content: { "application/json": infer B } } ? B : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: infer R }
  ? R extends { 200: infer A }
    ? Body<A>
    : R extends { 201: infer B }
      ? Body<B>
      : never
  : never;
type Known<T> = [T] extends [never] ? { __response_not_described__: true } : NonNullable<T>;
type MissingKeys<Mine, Generated> = Exclude<keyof Mine, keyof Known<Generated>>;
type Complete<Missing extends never> = Missing;
type Row<L> = L extends { results?: (infer R)[] } ? R : L extends (infer R)[] ? R : never;
type Prop<T, K extends string> = K extends keyof Known<T> ? Known<T>[K] : never;

type GeneratedDetail = Ok<"/api/v1/requests/{public_id}", "get">;
type GeneratedList = Ok<"/api/v1/requests", "get">;
type GeneratedApprovals = Ok<"/api/v1/approvals", "get">;
type GeneratedPreview = Ok<"/api/v1/requests/preview", "post">;

export type DetailIsComplete = Complete<MissingKeys<RequestDetail, GeneratedDetail>>;
export type StateIsComplete = Complete<MissingKeys<RequestOut["state"], Prop<GeneratedDetail, "state">>>;
export type ViewerIsComplete = Complete<MissingKeys<RequestOut["viewer"], Prop<GeneratedDetail, "viewer">>>;
export type ListRowIsComplete = Complete<MissingKeys<RequestOut, Row<GeneratedList>>>;
export type ApprovalIsComplete = Complete<MissingKeys<ApprovalItem, Row<GeneratedApprovals>>>;
export type PreviewIsComplete = Complete<MissingKeys<Preview, GeneratedPreview>>;
