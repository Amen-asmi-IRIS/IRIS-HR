import type { ReactNode } from "react";

interface FigureProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** The figure a person came for, shown first and alone. */
export function Figure({ label, value, hint }: FigureProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-2">
        <span data-figure className="text-[40px] leading-[40px] font-bold tracking-[-0.03em] text-foreground md:text-figure">
          {value}
        </span>
        {hint && <span className="text-body text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}
