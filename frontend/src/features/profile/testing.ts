import type { ProfileChange } from "./api";

export function makeProfileChange(overrides: Partial<ProfileChange> = {}): ProfileChange {
  return {
    public_id: "chg-1",
    employee: { public_id: "emp-1", name: "Amal Employee" },
    changes: [
      { field: "gender", old: "", new: "female" },
      { field: "phone", old: "", new: "20 111 222" },
    ],
    note: "Nouveau numéro",
    status: "pending",
    decided_by: null,
    decided_at: null,
    comment: "",
    created_at: "2026-10-20T09:30:00+01:00",
    ...overrides,
  };
}
