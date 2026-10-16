import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useApprovals } from "../api";
import { DecisionContextView } from "../decisions/DecisionContext";
import { DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { describeQuantity, describeWhen, joined } from "../text";
import { TypeTag } from "../TypeTag";
import type { ApprovalItem, Decision } from "../types";

const waitingSince = (item: ApprovalItem) => (item.waiting_since ? Date.parse(item.waiting_since) : 0);

/** The steps waiting for the signed-in person, the oldest first. Shared by the block and the page header. */
export function useToDecide() {
  const query = useApprovals({ queue: "mine", page_size: 100 });
  const items = useMemo(
    () => [...(query.data?.results ?? [])].sort((a, b) => waitingSince(a) - waitingSince(b)),
    [query.data],
  );
  return { query, items };
}

interface ToDecideBlockProps {
  /** The page that shows this block alone already carries the title. */
  hideTitle?: boolean;
}

/** "What is waiting for me?" (UI 6.1): each request with what is needed to decide it, and the decision itself. */
export function ToDecideBlock({ hideTitle = false }: ToDecideBlockProps) {
  const { t, lang } = useRequestsText();
  const { query, items } = useToDecide();
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const headingId = useId();

  const ask = (item: ApprovalItem, decision: Decision) =>
    setTarget({ request: item.request, stepId: item.step_id, decision });

  return (
    <section aria-labelledby={hideTitle ? undefined : headingId} aria-label={hideTitle ? t("toDecide.title") : undefined}>
      {!hideTitle && (
        <h2 id={headingId} className="text-section font-semibold">
          {t("toDecide.title")}
        </h2>
      )}
      {/* The decision sheet below is opened over this reading. */}
      <Gate query={query} form>
        {() =>
          items.length === 0 ? (
            <p className="mt-2 text-body text-muted-foreground">{t("toDecide.empty")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {items.map((item) => {
                const request = item.request;
                return (
                  <li key={item.step_id}>
                    <article
                      aria-label={t("toDecide.itemLabel", { name: request.employee.name, type: request.type.name })}
                      className="rounded-xl border border-border bg-card px-6 py-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold">{request.employee.name}</span>
                        <TypeTag code={request.type.code} name={request.type.name} />
                      </div>
                      <p className="mt-1 text-body">{joined(describeWhen(request, t, lang), describeQuantity(request, lang))}</p>
                      {item.waiting_since && (
                        <p className="text-caption text-muted-foreground">
                          {t("toDecide.since", { date: formatDate(item.waiting_since, lang) })}
                        </p>
                      )}
                      {item.via_delegation_from && (
                        <p className="text-caption text-muted-foreground">{t("toDecide.via", { name: item.via_delegation_from })}</p>
                      )}
                      <DecisionContextView context={item.decision_context} unit={request.type.unit} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => ask(item, "approve")}>
                          {t("decision.confirm.approve")}
                        </Button>
                        <Button variant="ghost" onClick={() => ask(item, "reject")}>
                          {t("decision.confirm.reject")}
                        </Button>
                        <Button asChild variant="ghost">
                          <Link to={`/team/requests/${request.public_id}`}>{t("common.open")}</Link>
                        </Button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Gate>
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
