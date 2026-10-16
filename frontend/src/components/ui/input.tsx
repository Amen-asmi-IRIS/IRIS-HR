import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-body text-foreground placeholder:text-muted-foreground read-only:bg-muted md:h-10",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    />
  );
}
