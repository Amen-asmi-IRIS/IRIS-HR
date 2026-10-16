import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A 44 × 24 track; on a phone the control around it is 44px high, the touch target of the master plan. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("group inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full md:h-6", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-11 items-center rounded-full bg-input transition-colors duration-[120ms] ease-standard group-data-[state=checked]:bg-primary"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-card transition-transform duration-[120ms] ease-standard data-[state=checked]:translate-x-[22px]" />
      </span>
    </SwitchPrimitive.Root>
  );
}
