import type { FieldProblem } from "@/api/problem";

export type RequestStatus = "draft" | "pending" | "returned" | "approved" | "rejected" | "withdrawn" | "cancelled";
export type StateKey =
  | "draft" | "waiting_manager" | "waiting_hr" | "waiting_person"
  | "returned" | "approved" | "rejected" | "withdrawn" | "cancelled";
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "returned" | "notified" | "skipped";
export type AmendmentStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ApproverRule = "line_manager" | "hr_role" | "named_person";
export type StepMode = "approve" | "notify";
export type Channel = "in_app" | "verbal" | "paper";
export type Decision = "approve" | "reject" | "return";
export type ViewerRelation = "owner" | "approver" | "team" | "hr" | "overview";
export type RequestAction =
  | "edit" | "submit" | "discard" | "withdraw" | "amend" | "withdraw_amendment" | "attach"
  | "decide" | "record_on_behalf" | "reassign" | "correct" | "cancel" | "reclassify";
export type CertificateStatus = "not_needed" | "attached" | "due" | "overdue" | "missing";
export type Unit = "day" | "hour";
export type CalendarLabel = "absent" | "remote" | "hidden";
export type Scope = "mine" | "team" | "all" | "decided";
export type QueueName = "mine" | "hr" | "certificates" | "stuck";

export interface RequestOut {
  public_id: string;
  version: number;
  employee: { public_id: string; name: string; department: string };
  type: { code: string; name: string; unit: Unit; calendar_label: CalendarLabel };
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  quantity: string;
  event: { id: number; name: string } | null;
  comment: string | null;
  comment_hidden: boolean;
  status: RequestStatus;
  state: { key: StateKey; waiting_on: string[]; last_actor: string | null; note: string | null; since: string | null };
  certificate: { status: CertificateStatus; due_at: string | null } | null;
  amendment: {
    public_id: string;
    kind: "cancel" | "change";
    status: AmendmentStatus;
    state_key: StateKey;
    waiting_on: string[];
  } | null;
  has_override: boolean;
  created_by_hr: boolean;
  viewer: { relation: ViewerRelation; actions: RequestAction[]; step_id: number | null };
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface StepOut {
  id: number;
  round: number;
  position: number;
  rule: ApproverRule;
  mode: StepMode;
  status: StepStatus;
  approvers: string[];
  decided_by: string | null;
  decided_at: string | null;
  recorded_by: string | null;
  channel: Channel | null;
  comment: string | null;
  amendment_public_id: string | null;
}

export interface AttachmentOut {
  public_id: string;
  /** "medical", "proof" or "scanned_form"; a plain string in the API description. */
  kind: string;
  name: string;
  size: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AmendmentOut {
  public_id: string;
  kind: "cancel" | "change";
  status: AmendmentStatus;
  /** Null when the request is restricted and the viewer may not read it. */
  reason: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  new_quantity: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface DecisionContext {
  balance: { now: string; after: string } | null;
  teammates_away: { name: string; label: "absent" | "remote"; start_date: string; end_date: string }[];
  cap: { used: string; limit: string } | null;
}

export interface RequestDetail extends RequestOut {
  steps: StepOut[];
  attachments: AttachmentOut[];
  amendments: AmendmentOut[];
  decision_context: DecisionContext | null;
}

export interface ApprovalItem {
  step_id: number;
  request: RequestOut;
  waiting_since: string | null;
  decision_context: DecisionContext;
}

export interface ChainStepPreview {
  position: number;
  rule: ApproverRule;
  mode: StepMode;
  approvers: string[];
}

export interface Preview {
  quantity: string;
  skipped_days: { date: string; reason: "weekend" | "holiday" }[];
  chain: ChainStepPreview[];
  balance: { now: string; on_start: string; after: string } | null;
  usage: {
    cap: { used: string; limit: string; period: "week" | "month" } | null;
    month_hours: string | null;
    event_days_allowed: string | null;
  };
  certificate_due_at: string | null;
  problems: FieldProblem[];
}

export interface HistoryItem {
  at: string;
  actor: string | null;
  action: string;
  summary: string;
  changes: Record<string, unknown> | null;
}

export interface RequestTypeOut {
  id: number;
  code: string;
  name: string;
  description: string;
  name_fr: string;
  name_en: string;
  description_fr: string;
  description_en: string;
  unit: Unit;
  allows_half_day: boolean;
  balance_effect: "deducts_annual" | "none";
  document_rule: "none" | "required_within_deadline";
  document_deadline_hours: number | null;
  allows_past_dates: boolean;
  notice_days: number;
  cap_quantity: string | null;
  cap_period: "none" | "week" | "month";
  reduces_meal_tickets: boolean;
  calendar_label: CalendarLabel;
  is_sensitive: boolean;
  uses_events: boolean;
  is_active: boolean;
  sort_order: number;
}

export type RequestTypeInput = Omit<RequestTypeOut, "id" | "name" | "description">;

/** A step as it is sent: the named person is an employee `public_id`. */
export interface ChainStepInput {
  approver_rule: ApproverRule;
  named_person: string | null;
  mode: StepMode;
  reminder_after_days: number;
  /** Empty on HR steps: they are reminded, never flagged. */
  flag_after_days: number | null;
}

/** A step as it is read: the named person comes with their name. */
export interface ChainStepOut {
  id: number;
  position: number;
  approver_rule: ApproverRule;
  named_person: { public_id: string; name: string } | null;
  mode: StepMode;
  reminder_after_days: number;
  flag_after_days: number | null;
}

export interface ExceptionalEventOut {
  id: number;
  name_fr: string;
  name_en: string;
  name: string;
  days_allowed: string;
  proof_required: boolean;
  is_active: boolean;
}

export type ExceptionalEventInput = Omit<ExceptionalEventOut, "id" | "name">;

export interface HolidayOut {
  id: number;
  date: string;
  name_fr: string;
  name_en: string;
  name: string;
  recurs_yearly: boolean;
}

export type HolidayInput = Omit<HolidayOut, "id" | "name">;

/** An approved request that covers the date of a holiday being added, moved or removed. */
export interface HolidayImpact {
  public_id: string;
  employee: string;
  type: string;
  start_date: string;
  end_date: string;
  quantity: string;
}

export interface RequestFields {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  exceptional_event: number | null;
  comment: string;
}

export interface CreateRequestBody extends RequestFields {
  type: string;
  employee?: string;
  override_reason?: string;
}

/** The exception of an HR request is fixed when it is created: a change never carries `override_reason`. */
export interface UpdateRequestBody extends RequestFields {
  version: number;
}

export interface PreviewBody extends Omit<RequestFields, "comment"> {
  type: string;
  employee?: string;
  /** The request being edited or amended, so that it does not collide with itself. */
  request?: string;
  override: boolean;
}

export interface AmendmentBody {
  kind: "cancel" | "change";
  start_date?: string;
  end_date?: string;
  starts_at_midday?: boolean;
  ends_at_midday?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
}

export interface CorrectBody {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export interface DecideBody {
  decision: Decision;
  comment: string;
  version: number;
}

export interface RecordOnBehalfInput {
  decided_by: string;
  decision: Decision;
  decided_at: string;
  channel: "verbal" | "paper";
  note: string;
  version: number;
  scan: File | null;
}

export interface ReassignBody {
  new_approver: string;
  reason: string;
}

export interface RequestListParams {
  scope: Scope;
  status?: string;
  type?: string;
  year?: string;
  employee?: string;
  from?: string;
  to?: string;
  department?: string;
  on_behalf?: string;
  has_override?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ApprovalParams {
  queue: QueueName;
  type?: string;
  department?: string;
  page?: number;
  page_size?: number;
}
