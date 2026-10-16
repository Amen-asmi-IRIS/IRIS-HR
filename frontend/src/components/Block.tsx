import { useId, type ReactNode } from "react";

interface BlockProps {
  title: string;
  children: ReactNode;
  /** A secondary action shown beside the title. */
  action?: ReactNode;
}

/** One block of a home or of a detail page: a titled section on a bordered surface. */
export function Block({ title, children, action }: BlockProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-section font-semibold text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
