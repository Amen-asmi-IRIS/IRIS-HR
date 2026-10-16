import { cn } from "@/lib/utils";

// Complete class names, so Tailwind finds them. Colours are the request-type tokens of tokens.css.
const STYLES: Record<string, string> = {
  annual: "bg-type-annual-bg text-type-annual border-[var(--type-annual-border)]",
  sick: "bg-type-sick-bg text-type-sick border-[var(--type-sick-border)]",
  exceptional: "bg-type-exceptional-bg text-type-exceptional border-[var(--type-exceptional-border)]",
  remote: "bg-type-remote-bg text-type-remote border-[var(--type-remote-border)]",
  permission: "bg-type-permission-bg text-type-permission border-[var(--type-permission-border)]",
};

interface TypeTagProps {
  code: string;
  name: string;
}

/** The kind of a request, as a small tag. A type HR adds later takes the neutral style. */
export function TypeTag({ code, name }: TypeTagProps) {
  return (
    <span
      data-type={code}
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-caption font-medium",
        STYLES[code] ?? STYLES.remote,
      )}
    >
      {name}
    </span>
  );
}
