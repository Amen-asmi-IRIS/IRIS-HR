import type {
  ApprovalItem, ExceptionalEventOut, HolidayOut, Preview, RequestDetail, RequestOut, RequestTypeOut, StepOut,
} from "./types";

// A page of a paginated list and an answer in the problem format, as plan 01b's test helpers build them.
export { makePage as paginated, problemResponse } from "@/test/fixtures";

const ANNUAL: RequestTypeOut = {
  id: 1,
  code: "annual",
  name: "Congé annuel",
  description: "Vos jours de congé payé.",
  name_fr: "Congé annuel",
  name_en: "Annual leave",
  description_fr: "Vos jours de congé payé.",
  description_en: "Your paid leave days.",
  unit: "day",
  allows_half_day: true,
  balance_effect: "deducts_annual",
  document_rule: "none",
  document_deadline_hours: null,
  allows_past_dates: false,
  notice_days: 0,
  cap_quantity: null,
  cap_period: "none",
  reduces_meal_tickets: true,
  calendar_label: "absent",
  is_sensitive: false,
  uses_events: false,
  is_active: true,
  sort_order: 1,
};

/** The five seeded types, as plan 03a's data migration creates them (PRD 5.3). */
export const TYPES: Record<"annual" | "sick" | "exceptional" | "permission" | "remote", RequestTypeOut> = {
  annual: ANNUAL,
  sick: {
    ...ANNUAL,
    id: 2,
    code: "sick",
    name: "Congé maladie",
    description: "Déclarez une absence pour maladie.",
    name_fr: "Congé maladie",
    name_en: "Sick leave",
    description_fr: "Déclarez une absence pour maladie.",
    description_en: "Report an absence due to illness.",
    balance_effect: "none",
    document_rule: "required_within_deadline",
    allows_past_dates: true,
    is_sensitive: true,
    sort_order: 2,
  },
  exceptional: {
    ...ANNUAL,
    id: 3,
    code: "exceptional",
    name: "Congé exceptionnel",
    description: "Pour un événement familial.",
    name_fr: "Congé exceptionnel",
    name_en: "Exceptional leave",
    description_fr: "Pour un événement familial.",
    description_en: "For a family event.",
    allows_half_day: false,
    balance_effect: "none",
    uses_events: true,
    sort_order: 3,
  },
  permission: {
    ...ANNUAL,
    id: 4,
    code: "permission",
    name: "Autorisation de sortie",
    description: "Une absence de quelques heures.",
    name_fr: "Autorisation de sortie",
    name_en: "Hourly permission",
    description_fr: "Une absence de quelques heures.",
    description_en: "A few hours away.",
    unit: "hour",
    allows_half_day: false,
    balance_effect: "none",
    reduces_meal_tickets: false,
    calendar_label: "hidden",
    sort_order: 4,
  },
  remote: {
    ...ANNUAL,
    id: 5,
    code: "remote",
    name: "Télétravail",
    description: "Travailler depuis chez vous.",
    name_fr: "Télétravail",
    name_en: "Remote work",
    description_fr: "Travailler depuis chez vous.",
    description_en: "Work from home.",
    balance_effect: "none",
    cap_quantity: "2.00",
    cap_period: "week",
    reduces_meal_tickets: false,
    calendar_label: "remote",
    sort_order: 5,
  },
};

export function makeType(code: keyof typeof TYPES, overrides: Partial<RequestTypeOut> = {}): RequestTypeOut {
  return { ...TYPES[code], ...overrides };
}

export type RequestOverrides = Partial<Omit<RequestOut, "state" | "viewer" | "employee" | "type">> & {
  state?: Partial<RequestOut["state"]>;
  viewer?: Partial<RequestOut["viewer"]>;
  employee?: Partial<RequestOut["employee"]>;
  type?: Partial<RequestOut["type"]>;
};

/** A pending three-day annual leave of Amal Trabelsi, waiting for her manager, seen by herself. */
export function makeRequest(overrides: RequestOverrides = {}): RequestOut {
  const { state, viewer, employee, type, ...rest } = overrides;
  return {
    public_id: "req-1",
    version: 1,
    employee: { public_id: "emp-owner", name: "Amal Trabelsi", department: "Souscription", ...employee },
    type: { code: "annual", name: "Congé annuel", unit: "day", calendar_label: "absent", ...type },
    start_date: "2026-11-09",
    end_date: "2026-11-11",
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    quantity: "3.00",
    event: null,
    comment: null,
    comment_hidden: false,
    status: "pending",
    state: {
      key: "waiting_manager",
      waiting_on: ["Sami Ben Ali"],
      last_actor: null,
      note: null,
      since: "2026-10-28T09:12:00+01:00",
      ...state,
    },
    certificate: { status: "not_needed", due_at: null },
    amendment: null,
    has_override: false,
    created_by_hr: false,
    viewer: { relation: "owner", actions: ["edit", "withdraw"], step_id: null, ...viewer },
    submitted_at: "2026-10-28T09:12:00+01:00",
    decided_at: null,
    created_at: "2026-10-28T09:10:00+01:00",
    ...rest,
  };
}

export function makeStep(overrides: Partial<StepOut> = {}): StepOut {
  return {
    id: 7,
    round: 1,
    position: 1,
    rule: "line_manager",
    mode: "approve",
    status: "pending",
    approvers: ["Sami Ben Ali"],
    decided_by: null,
    decided_at: null,
    recorded_by: null,
    channel: null,
    comment: null,
    amendment_public_id: null,
    ...overrides,
  };
}

export type DetailOverrides = RequestOverrides &
  Partial<Pick<RequestDetail, "steps" | "attachments" | "amendments" | "decision_context">>;

export function makeRequestDetail(overrides: DetailOverrides = {}): RequestDetail {
  const { steps, attachments, amendments, decision_context, ...rest } = overrides;
  return {
    ...makeRequest(rest),
    steps: steps ?? [
      makeStep(),
      makeStep({ id: 8, position: 2, rule: "hr_role", status: "waiting", approvers: ["Leila Gharbi"] }),
    ],
    attachments: attachments ?? [],
    amendments: amendments ?? [],
    decision_context: decision_context ?? null,
  };
}

export interface ApprovalOverrides {
  step_id?: number;
  request?: RequestOverrides;
  waiting_since?: string;
  via_delegation_from?: string | null;
  decision_context?: ApprovalItem["decision_context"];
}

/** The same request as seen by the manager who must decide it. */
export function makeApprovalItem(overrides: ApprovalOverrides = {}): ApprovalItem {
  return {
    step_id: overrides.step_id ?? 7,
    request: makeRequest({
      ...overrides.request,
      viewer: { relation: "approver", actions: ["decide"], step_id: overrides.step_id ?? 7, ...overrides.request?.viewer },
    }),
    waiting_since: overrides.waiting_since ?? "2026-10-28T09:12:00+01:00",
    via_delegation_from: overrides.via_delegation_from ?? null,
    decision_context: overrides.decision_context ?? { balance: null, teammates_away: [], cap: null },
  };
}

export function makePreview(overrides: Partial<Preview> = {}): Preview {
  return {
    quantity: "3.00",
    skipped_days: [],
    chain: [
      { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] },
      { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] },
    ],
    balance: null,
    usage: { cap: null, month_hours: null, event_days_allowed: null },
    certificate_due_at: null,
    problems: [],
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<ExceptionalEventOut> = {}): ExceptionalEventOut {
  return {
    id: 1,
    name_fr: "Mariage",
    name_en: "Marriage",
    name: "Mariage",
    days_allowed: "3.00",
    proof_required: true,
    is_active: true,
    ...overrides,
  };
}

export function makeHoliday(overrides: Partial<HolidayOut> = {}): HolidayOut {
  return {
    id: 1,
    date: "2026-05-01",
    name_fr: "Fête du travail",
    name_en: "Labour Day",
    name: "Fête du travail",
    recurs_yearly: true,
    ...overrides,
  };
}

