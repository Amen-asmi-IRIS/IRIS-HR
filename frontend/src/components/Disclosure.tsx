import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DisclosureProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Content that is "one step away". Children are mounted only while open. */
export function Disclosure({ title, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-t border-divider">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-section font-semibold text-foreground"
        >
          {title}
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard", open && "rotate-180")} />
        </button>
      </h2>
      <div id={id} hidden={!open} className="pb-4">
        {open ? children : null}
      </div>
    </section>
  );
}
