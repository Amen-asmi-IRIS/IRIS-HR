import { Link } from "react-router";
import { EmptyState } from "@/components";
import { useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { TypeTag } from "../TypeTag";

interface TypeChoiceProps {
  /** The address of step two for a type code. */
  hrefFor: (code: string) => string;
}

/** Step one of a new request: the active types, each with one line saying what it is for. */
export function TypeChoice({ hrefFor }: TypeChoiceProps) {
  const { t } = useRequestsText();
  const types = useRequestTypes();
  return (
    <Gate query={types}>
      {(all) => {
        const active = all.filter((type) => type.is_active).sort((a, b) => a.sort_order - b.sort_order);
        if (active.length === 0) return <EmptyState title={t("choice.none")} hint={t("choice.noneHint")} />;
        return (
          <ul aria-label={t("choice.title")} className="grid gap-3 sm:grid-cols-2">
            {active.map((type) => (
              <li key={type.code}>
                <Link
                  to={hrefFor(type.code)}
                  className="flex min-h-11 flex-col items-start gap-2 rounded-xl border border-border bg-card px-6 py-5 transition-colors duration-150 hover:bg-muted"
                >
                  <TypeTag code={type.code} name={type.name} />
                  <span className="text-body text-text-secondary">{type.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        );
      }}
    </Gate>
  );
}
