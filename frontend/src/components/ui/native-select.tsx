import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The browser's own select: it works with a keyboard, a screen reader and a phone without extra code. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-body text-foreground md:h-10",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
