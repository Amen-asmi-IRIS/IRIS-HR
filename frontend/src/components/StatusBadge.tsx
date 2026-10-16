import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "waiting" | "approved" | "refused" | "info" | "neutral";

const TONES: Record<StatusTone, { badge: string; dot: string }> = {
  waiting: { badge: "bg-waiting-bg text-waiting", dot: "bg-waiting-dot" },
  approved: { badge: "bg-approved-bg text-approved", dot: "bg-approved-dot" },
  refused: { badge: "bg-refused-bg text-refused", dot: "bg-refused-dot" },
  info: { badge: "bg-info-bg text-info", dot: "bg-info-dot" },
  neutral: { badge: "bg-neutral-bg text-neutral", dot: "bg-neutral-dot" },
};

/** A status is a sentence with a coloured dot, never a code. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-caption font-medium", TONES[tone].badge)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", TONES[tone].dot)} />
      {children}
    </span>
  );
}
