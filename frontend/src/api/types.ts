import type { paths } from "./schema";

type JsonBody<R> = R extends { content: { "application/json": infer B } } ? B : never;
type Success<R> = R extends { 200: infer S } ? JsonBody<S> : R extends { 201: infer S } ? JsonBody<S> : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: infer R } ? Success<R> : never;
type Rows<Page> = Page extends { results?: infer R } ? (NonNullable<R> extends (infer Row)[] ? Row : never) : never;
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: infer B }
  ? NonNullable<B> extends { content: { "application/json": infer J } }
    ? J
    : never
  : never;

type Query<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

export type Role = "employee" | "manager" | "hr" | "exec" | "sysadmin";

export type AccountQuery = Query<"/api/v1/accounts", "get">;
export type AuditQuery = Query<"/api/v1/audit/security", "get">;

export type Credentials = Body<"/api/v1/auth/login", "post">;
export type MeChanges = Body<"/api/v1/auth/me", "patch">;
export type PasswordChange = Body<"/api/v1/auth/password", "post">;
export type AccountCreate = Body<"/api/v1/accounts", "post">;

export type Me = Ok<"/api/v1/auth/me", "get">;
export type Health = Ok<"/api/v1/health", "get">;
export type AdminStatus = Ok<"/api/v1/admin/status", "get">;

export type AccountPage = Ok<"/api/v1/accounts", "get">;
export type Account = Rows<AccountPage>;
export type AccountCreated = Ok<"/api/v1/accounts", "post">;
export type AccountDetail = Ok<"/api/v1/accounts/{public_id}", "get">;
export type TemporaryPassword = Ok<"/api/v1/accounts/{public_id}/reset-password", "post">;

export type AuditPage = Ok<"/api/v1/audit/security", "get">;
export type AuditEvent = Rows<AuditPage>;

export type Setting = Ok<"/api/v1/settings/system", "get">[number];

export type NotificationPage = Ok<"/api/v1/notifications", "get">;
export type Notification = Rows<NotificationPage>;

// --- Organisation (plan 02) ---------------------------------------------------------------

export type EmployeeQuery = Query<"/api/v1/employees", "get">;
export type EmployeePage = Ok<"/api/v1/employees", "get">;
export type EmployeeRow = Rows<EmployeePage>;
/** The whole record for its owner, HR and executives; the team view for a manager. */
export type EmployeeDetail = Ok<"/api/v1/employees/{public_id}", "get">;
export type Employee = Ok<"/api/v1/employees/me", "get">;
export type TeamMember = Exclude<EmployeeDetail, Employee>;
export type EmployeeBrief = Ok<"/api/v1/employees/directory", "get">[number];
export type EmployeePayload = Body<"/api/v1/employees", "post">;
export type EmployeeChanges = Body<"/api/v1/employees/{public_id}", "patch">;

export type Department = Ok<"/api/v1/departments", "get">[number];
export type Position = Ok<"/api/v1/positions", "get">[number];
export type DepartmentPayload = Body<"/api/v1/departments", "post">;
export type DepartmentChanges = Body<"/api/v1/departments/{id}", "patch">;
export type PositionPayload = Body<"/api/v1/positions", "post">;
export type PositionChanges = Body<"/api/v1/positions/{id}", "patch">;

export type EmployeeDocument = Ok<"/api/v1/employees/{public_id}/documents", "get">[number];
export type ArchivePreview = Ok<"/api/v1/employees/{public_id}/archive-preview", "get">;
export type Departure = Body<"/api/v1/employees/{public_id}/archive", "post">;
export type EmployeeHistoryPage = Ok<"/api/v1/employees/{public_id}/history", "get">;

export type DelegationPage = Ok<"/api/v1/delegations", "get">;
export type Delegation = Rows<DelegationPage>;
export type NewDelegation = Body<"/api/v1/delegations", "post">;

export type ProfileChangePage = Ok<"/api/v1/profile-changes", "get">;
export type ProfileChange = Rows<ProfileChangePage>;
export type NewProfileChange = Body<"/api/v1/profile-changes", "post">;

// --- Balances (plan 04) -------------------------------------------------------------------

export type Balance = Ok<"/api/v1/balances/{employee_public_id}", "get">;
export type LedgerPage = Ok<"/api/v1/balances/{employee_public_id}/ledger", "get">;
export type LedgerLine = Rows<LedgerPage>;
export type AdjustmentPayload = Body<"/api/v1/balances/{employee_public_id}/adjustments", "post">;

// --- Calendar (plan 05) -------------------------------------------------------------------

export type CalendarFeed = Ok<"/api/v1/calendar", "get">;
export type CalendarEntry = CalendarFeed["entries"][number];
export type CalendarHoliday = CalendarFeed["holidays"][number];
export type CalendarQuery = Query<"/api/v1/calendar", "get">;

// --- Homes and switcher counts (plan 05) -----------------------------------------------------

export type MeHomeWire = Ok<"/api/v1/home/me", "get">;
export type TeamHome = Ok<"/api/v1/home/team", "get">;
export type OverviewHome = Ok<"/api/v1/home/overview", "get">;
export type WorkspaceSummary = Ok<"/api/v1/workspaces/summary", "get">;

// Reports and the KPMG export (plan 06).
export type ReportFilterOptions = Ok<"/api/v1/report-filters", "get">;
export type ReportOut = Ok<"/api/v1/reports/{name}", "get">;
export type ReportQueryParams = Query<"/api/v1/reports/{name}", "get">;
export type ReportName = paths["/api/v1/reports/{name}"]["get"]["parameters"]["path"]["name"];
export type KpmgDefaultPeriod = Ok<"/api/v1/exports/kpmg/default-period", "get">;
export type KpmgQueryParams = Query<"/api/v1/exports/kpmg", "get">;
