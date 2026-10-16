import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    />
  );
}
