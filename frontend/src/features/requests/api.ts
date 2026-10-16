import {
  keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey,
} from "@tanstack/react-query";
import { api, call } from "@/api/client";
import { ProblemError } from "@/api/problem";
import { rowsOf, type Paginated } from "./platform";
import type {
  AmendmentBody, ApprovalItem, ApprovalParams, AttachmentOut, ChainStepInput, ChainStepOut, ChainStepPreview,
  CorrectBody, CreateRequestBody, DecideBody, ExceptionalEventInput, ExceptionalEventOut, HistoryItem, HolidayImpact,
  HolidayInput, HolidayOut, Preview, PreviewBody, ReassignBody, RecordOnBehalfInput, RequestDetail, RequestListParams,
  RequestOut, RequestTypeInput, RequestTypeOut, UpdateRequestBody,
} from "./types";

// ---------------------------------------------------------------- boundary helpers

/** Responses are read as the shapes of `types.ts`; `types.contract.ts` checks them against the schema. */
const shaped = <T>(promise: Promise<unknown>) => promise as Promise<T>;

/** A query string without its empty values. */
function compact(params: object): never {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined && value !== null) out[key] = value as string | number | boolean;
  }
  return out as never;
}

const json = (value: unknown) => value as never;

function multipart(fields: Record<string, string | Blob | null>): () => FormData {
  return () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null) data.append(key, value);
    }
    return data;
  };
}

const byPublicId = (public_id: string) => ({ path: { public_id } });
const byId = (id: number) => ({ path: { id } });

// ---------------------------------------------------------------- keys

export const requestKeys = {
  all: ["requests"] as const,
  list: (params: RequestListParams) => ["requests", "list", params] as const,
  detail: (id: string) => ["requests", "detail", id] as const,
  history: (id: string) => ["requests", "history", id] as const,
  preview: (body: PreviewBody | null) => ["requests", "preview", body] as const,
  approvals: (params: ApprovalParams) => ["requests", "approvals", params] as const,
};

const CONFIG_ROOT = ["request-config"] as const;

export const configKeys = {
  all: CONFIG_ROOT,
  types: [...CONFIG_ROOT, "types"] as const,
  steps: (typeId: number) => [...CONFIG_ROOT, "steps", typeId] as const,
  chainPreview: (typeId: number, employee: string) => [...CONFIG_ROOT, "chain-preview", typeId, employee] as const,
  events: [...CONFIG_ROOT, "events"] as const,
  holidays: (year: number) => [...CONFIG_ROOT, "holidays", year] as const,
  holidayImpact: (date: string) => [...CONFIG_ROOT, "holiday-impact", date] as const,
  departments: (lang: string) => [...CONFIG_ROOT, "departments", lang] as const,
};

/**
 * Query keys refetched after every change to a request. Plans 04 and 05 append their own
 * (balances, home blocks, switcher counts) so those refresh without a manual reload.
 */
export const AFFECTED_KEYS: QueryKey[] = [requestKeys.all];

export async function refreshRequests(qc: QueryClient): Promise<void> {
  await Promise.all(AFFECTED_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function isConflict(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 409;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 404;
}

// ---------------------------------------------------------------- calls

export const requestsApi = {
  list: (params: RequestListParams) =>
    shaped<Paginated<RequestOut>>(call(api.GET("/api/v1/requests", { params: { query: compact(params) } }))),
  detail: (id: string) =>
    shaped<RequestDetail>(call(api.GET("/api/v1/requests/{public_id}", { params: byPublicId(id) }))),
  history: (id: string) =>
    shaped<HistoryItem[]>(call(api.GET("/api/v1/requests/{public_id}/history", { params: byPublicId(id) }))),
  preview: (body: PreviewBody) =>
    shaped<Preview>(call(api.POST("/api/v1/requests/preview", { body: json(body) }))),
  create: (body: CreateRequestBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/requests", { body: json(body) }))),
  update: (id: string, body: UpdateRequestBody) =>
    shaped<RequestDetail>(
      call(api.PATCH("/api/v1/requests/{public_id}", { params: byPublicId(id), body: json(body) })),
    ),
  discard: (id: string) =>
    shaped<void>(call(api.DELETE("/api/v1/requests/{public_id}", { params: byPublicId(id) }))),
  submit: (id: string, version: number) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/submit", { params: byPublicId(id), body: json({ version }) })),
    ),
  withdraw: (id: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/withdraw", { params: byPublicId(id), body: json({}) })),
    ),
  attach: (id: string, file: File) =>
    shaped<AttachmentOut>(
      call(
        api.POST("/api/v1/requests/{public_id}/attachments", {
          params: byPublicId(id),
          body: json({ file }),
          bodySerializer: multipart({ file }),
        }),
      ),
    ),
  openAmendment: (id: string, body: AmendmentBody) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/amendments", { params: byPublicId(id), body: json(body) })),
    ),
  withdrawAmendment: (amendmentId: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/amendments/{public_id}/withdraw", { params: byPublicId(amendmentId), body: json({}) })),
    ),
  correct: (id: string, body: CorrectBody) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/correct", { params: byPublicId(id), body: json(body) })),
    ),
  cancel: (id: string, reason: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/cancel", { params: byPublicId(id), body: json({ reason }) })),
    ),
  reclassify: (id: string, overrideReason: string) =>
    shaped<RequestDetail>(
      call(
        api.POST("/api/v1/requests/{public_id}/reclassify", {
          params: byPublicId(id),
          body: json(overrideReason ? { override_reason: overrideReason } : {}),
        }),
      ),
    ),
  approvals: (params: ApprovalParams) =>
    shaped<Paginated<ApprovalItem>>(call(api.GET("/api/v1/approvals", { params: { query: compact(params) } }))),
  decide: (stepId: number, body: DecideBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/steps/{id}/decide", { params: byId(stepId), body: json(body) }))),
  recordOnBehalf: (stepId: number, input: RecordOnBehalfInput) =>
    shaped<RequestDetail>(
      call(
        api.POST("/api/v1/steps/{id}/record-on-behalf", {
          params: byId(stepId),
          body: json(input),
          bodySerializer: multipart({
            decided_by: input.decided_by,
            decision: input.decision,
            decided_at: input.decided_at,
            channel: input.channel,
            note: input.note,
            version: String(input.version),
            scan: input.scan,
          }),
        }),
      ),
    ),
  reassign: (stepId: number, body: ReassignBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/steps/{id}/reassign", { params: byId(stepId), body: json(body) }))),
};

interface DepartmentRow {
  id: number;
  name?: string;
  name_fr?: string;
  name_en?: string;
}

export const configApi = {
  types: async () =>
    rowsOf(await shaped<RequestTypeOut[] | Paginated<RequestTypeOut>>(call(api.GET("/api/v1/request-types")))),
  createType: (body: RequestTypeInput) =>
    shaped<RequestTypeOut>(call(api.POST("/api/v1/request-types", { body: json(body) }))),
  updateType: (id: number, body: Partial<RequestTypeInput>) =>
    shaped<RequestTypeOut>(call(api.PATCH("/api/v1/request-types/{id}", { params: byId(id), body: json(body) }))),
  steps: async (typeId: number) =>
    rowsOf(
      await shaped<ChainStepOut[] | Paginated<ChainStepOut>>(
        call(api.GET("/api/v1/request-types/{id}/steps", { params: byId(typeId) })),
      ),
    ),
  saveSteps: (typeId: number, steps: ChainStepInput[]) =>
    shaped<ChainStepOut[]>(
      call(api.PUT("/api/v1/request-types/{id}/steps", { params: byId(typeId), body: json({ steps }) })),
    ),
  chainPreview: (typeId: number, employee: string) =>
    shaped<ChainStepPreview[]>(
      call(
        api.GET("/api/v1/request-types/{id}/chain-preview", {
          params: { path: { id: typeId }, query: compact({ employee }) },
        }),
      ),
    ),
  events: async () =>
    rowsOf(
      await shaped<ExceptionalEventOut[] | Paginated<ExceptionalEventOut>>(call(api.GET("/api/v1/exceptional-events"))),
    ),
  createEvent: (body: ExceptionalEventInput) =>
    shaped<ExceptionalEventOut>(call(api.POST("/api/v1/exceptional-events", { body: json(body) }))),
  updateEvent: (id: number, body: ExceptionalEventInput) =>
    shaped<ExceptionalEventOut>(
      call(api.PATCH("/api/v1/exceptional-events/{id}", { params: byId(id), body: json(body) })),
    ),
  holidays: async (year: number) =>
    rowsOf(
      await shaped<HolidayOut[] | Paginated<HolidayOut>>(
        call(api.GET("/api/v1/holidays", { params: { query: compact({ year }) } })),
      ),
    ),
  createHoliday: (body: HolidayInput) =>
    shaped<HolidayOut>(call(api.POST("/api/v1/holidays", { body: json(body) }))),
  updateHoliday: (id: number, body: HolidayInput) =>
    shaped<HolidayOut>(call(api.PATCH("/api/v1/holidays/{id}", { params: byId(id), body: json(body) }))),
  deleteHoliday: (id: number) => shaped<void>(call(api.DELETE("/api/v1/holidays/{id}", { params: byId(id) }))),
  copyHolidays: (fromYear: number, toYear: number) =>
    shaped<HolidayOut[]>(
      call(api.POST("/api/v1/holidays/copy", { body: json({ from_year: fromYear, to_year: toYear }) })),
    ),
  holidayImpact: async (date: string) =>
    rowsOf(
      await shaped<HolidayImpact[] | Paginated<HolidayImpact>>(
        call(api.GET("/api/v1/holidays/impact", { params: { query: compact({ date }) } })),
      ),
    ),
  departments: async (lang: string) =>
    rowsOf(await shaped<DepartmentRow[] | Paginated<DepartmentRow>>(call(api.GET("/api/v1/departments")))).map(
      (row) => ({
        value: String(row.id),
        label: row.name ?? (lang.startsWith("en") ? row.name_en : row.name_fr) ?? String(row.id),
      }),
    ),
};

// ---------------------------------------------------------------- request queries and mutations

export function useRequestList(params: RequestListParams) {
  return useQuery({
    queryKey: requestKeys.list(params),
    queryFn: () => requestsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: () => requestsApi.detail(id),
    enabled: id !== "",
    retry: false,
  });
}

export function useRequestHistory(id: string) {
  return useQuery({ queryKey: requestKeys.history(id), queryFn: () => requestsApi.history(id), retry: false });
}

export function usePreview(body: PreviewBody | null) {
  return useQuery({
    queryKey: requestKeys.preview(body),
    queryFn: () => requestsApi.preview(body as PreviewBody),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useApprovals(params: ApprovalParams) {
  return useQuery({
    queryKey: requestKeys.approvals(params),
    queryFn: () => requestsApi.approvals(params),
    placeholderData: keepPreviousData,
  });
}

function useRequestMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => refreshRequests(qc) });
}

export const useCreateRequest = () => useRequestMutation(requestsApi.create);
export const useUpdateRequest = () =>
  useRequestMutation(({ id, body }: { id: string; body: UpdateRequestBody }) => requestsApi.update(id, body));
export const useSubmitRequest = () =>
  useRequestMutation(({ id, version }: { id: string; version: number }) => requestsApi.submit(id, version));
export const useWithdrawRequest = () => useRequestMutation(requestsApi.withdraw);
export const useDiscardRequest = () => useRequestMutation(requestsApi.discard);
export const useAttachFile = () =>
  useRequestMutation(({ id, file }: { id: string; file: File }) => requestsApi.attach(id, file));
export const useOpenAmendment = () =>
  useRequestMutation(({ id, body }: { id: string; body: AmendmentBody }) => requestsApi.openAmendment(id, body));
export const useWithdrawAmendment = () => useRequestMutation(requestsApi.withdrawAmendment);
export const useCorrectRequest = () =>
  useRequestMutation(({ id, body }: { id: string; body: CorrectBody }) => requestsApi.correct(id, body));
export const useCancelRequest = () =>
  useRequestMutation(({ id, reason }: { id: string; reason: string }) => requestsApi.cancel(id, reason));
export const useReclassifyRequest = () =>
  useRequestMutation(({ id, overrideReason }: { id: string; overrideReason: string }) =>
    requestsApi.reclassify(id, overrideReason),
  );
export const useDecideStep = () =>
  useRequestMutation(({ stepId, body }: { stepId: number; body: DecideBody }) => requestsApi.decide(stepId, body));
export const useRecordOnBehalf = () =>
  useRequestMutation(({ stepId, input }: { stepId: number; input: RecordOnBehalfInput }) =>
    requestsApi.recordOnBehalf(stepId, input),
  );
export const useReassignStep = () =>
  useRequestMutation(({ stepId, body }: { stepId: number; body: ReassignBody }) => requestsApi.reassign(stepId, body));

// ---------------------------------------------------------------- configuration queries and mutations

function useConfigMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, alsoRequests = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: configKeys.all });
      if (alsoRequests) await refreshRequests(qc);
    },
  });
}

export function useRequestTypes() {
  return useQuery({ queryKey: configKeys.types, queryFn: configApi.types, staleTime: 60_000 });
}

export const useSaveType = () =>
  useConfigMutation(({ id, body }: { id: number | null; body: RequestTypeInput }) => {
    if (id === null) return configApi.createType(body);
    // The code and the unit of a type are fixed once it exists (plan 03a): they are not sent again.
    const changes: Partial<RequestTypeInput> = { ...body };
    delete changes.code;
    delete changes.unit;
    return configApi.updateType(id, changes);
  });

export function useTypeSteps(typeId: number | null) {
  return useQuery({
    queryKey: configKeys.steps(typeId ?? 0),
    queryFn: () => configApi.steps(typeId as number),
    enabled: typeId !== null,
  });
}

export const useSaveTypeSteps = () =>
  useConfigMutation(({ typeId, steps }: { typeId: number; steps: ChainStepInput[] }) =>
    configApi.saveSteps(typeId, steps),
  );

export function useChainPreview(typeId: number | null, employee: string | null) {
  return useQuery({
    queryKey: configKeys.chainPreview(typeId ?? 0, employee ?? ""),
    queryFn: () => configApi.chainPreview(typeId as number, employee as string),
    enabled: typeId !== null && employee !== null,
    retry: false,
  });
}

export function useEvents(enabled = true) {
  return useQuery({ queryKey: configKeys.events, queryFn: configApi.events, enabled, staleTime: 60_000 });
}

export const useSaveEvent = () =>
  useConfigMutation(({ id, body }: { id: number | null; body: ExceptionalEventInput }) =>
    id === null ? configApi.createEvent(body) : configApi.updateEvent(id, body),
  );

export function useHolidays(year: number) {
  return useQuery({ queryKey: configKeys.holidays(year), queryFn: () => configApi.holidays(year) });
}

export const useSaveHoliday = () =>
  useConfigMutation(
    ({ id, body }: { id: number | null; body: HolidayInput }) =>
      id === null ? configApi.createHoliday(body) : configApi.updateHoliday(id, body),
    true,
  );
export const useDeleteHoliday = () => useConfigMutation(configApi.deleteHoliday, true);
export const useCopyHolidays = () =>
  useConfigMutation(
    ({ fromYear, toYear }: { fromYear: number; toYear: number }) => configApi.copyHolidays(fromYear, toYear),
    true,
  );

export function useHolidayImpact(date: string) {
  return useQuery({
    queryKey: configKeys.holidayImpact(date),
    queryFn: () => configApi.holidayImpact(date),
    enabled: date !== "",
    retry: false,
  });
}

/** Departments as select options. Only HR and executives may read them: pass `enabled` accordingly. */
export function useDepartmentOptions(lang: string, enabled = true) {
  return useQuery({
    queryKey: configKeys.departments(lang),
    queryFn: () => configApi.departments(lang),
    enabled,
    staleTime: 300_000,
  });
}
