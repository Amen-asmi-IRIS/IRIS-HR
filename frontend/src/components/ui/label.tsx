import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  // The caller passes htmlFor; the lint rule cannot see it through the spread.
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <label className={cn("text-body font-medium text-foreground", className)} {...props} />;
}
