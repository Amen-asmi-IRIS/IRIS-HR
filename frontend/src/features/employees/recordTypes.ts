import type { ReactNode } from "react";

import type { EmployeeDetail } from "./api";

export type RecordMode = "hr" | "team" | "overview";

export interface RecordBlock {
  id: string;
  /** A fully qualified translation key, "namespace:key". */
  titleKey: string;
  order: number;
  modes: RecordMode[];
  render: (employee: EmployeeDetail, mode: RecordMode) => ReactNode;
}

export interface RecordFact {
  id: string;
  /** A fully qualified translation key, "namespace:key". */
  labelKey: string;
  order: number;
  modes: RecordMode[];
  /** Returning null hides the fact. */
  render: (employee: EmployeeDetail) => ReactNode;
}
