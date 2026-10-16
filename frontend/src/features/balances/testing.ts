import type { Balance, LedgerLine, LedgerPage } from "./api";

export const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

export function makeBalance(overrides: Partial<Balance> = {}): Balance {
  return {
    employee: { public_id: EMPLOYEE_ID, name: "Amel Trabelsi" },
    current: "12.50",
    pending: "3.00",
    approved_upcoming: "2.00",
    next_credit_amount: "2.50",
    next_credit_date: "2026-10-31",
    has_opening: true,
    opening_date: "2026-06-30",
    can_enter_opening: false,
    as_of: null,
    ...overrides,
  };
}

export function makeLedgerLine(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return {
    id: 1,
    kind: "credit",
    amount: "2.50",
    effective_date: "2026-09-30",
    period: "2026-09",
    reason: "",
    request_public_id: null,
    created_by: null,
    created_at: "2026-09-30T01:00:00+01:00",
    balance_after: "12.50",
    ...overrides,
  };
}

export function ledgerPage(lines: LedgerLine[], count = lines.length): LedgerPage {
  return { count, next: null, previous: null, results: lines };
}
