import type { Delegation } from "./api";

export function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  return {
    public_id: "del-1",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    delegate: { public_id: "emp-6", name: "Nadia Manager" },
    start_date: "2026-11-02",
    end_date: "2026-11-06",
    state: "active",
    direction: "given",
    can_end: true,
    created_at: "2026-10-30T10:00:00+01:00",
    ...overrides,
  };
}
