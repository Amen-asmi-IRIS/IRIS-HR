import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Why the list is empty. */
  title: string;
  hint?: string;
  /** The action that would fill it. */
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card px-6 py-8">
      <p className="text-section font-semibold text-foreground">{title}</p>
      {hint && <p className="text-body text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
