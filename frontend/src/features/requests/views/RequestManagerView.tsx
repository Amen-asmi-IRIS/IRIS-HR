import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { DecisionContextView } from "../decisions/DecisionContext";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { useRequestsText, useWorkspacePrefix } from "../platform";
import { RequestView } from "../RequestView";
import type { Decision, RequestDetail } from "../types";

/**
 * A request seen by the requester's manager, a delegate or a named approver (UI 6.2).
 * It decides when the API lists `decide`; otherwise it only informs.
 */
export default function RequestManagerView({ request }: { request: RequestDetail }) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const prefix = useWorkspacePrefix();
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  const stepId = request.viewer.step_id;
  const canDecide = request.viewer.actions.includes("decide") && stepId !== null;
  const back = prefix === "team" ? "/team" : `/${prefix}/requests`;
  const ask = (decision: Decision) => {
    if (stepId !== null) setTarget({ request, stepId, decision });
  };

  return (
    <>
      <RequestView
        request={request}
        back={back}
        commentFirst
        context={
          <>
            <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
            {!canDecide && request.comment_hidden && (
              <p className="mt-3 text-body text-text-secondary">{t("manager.infoOnly")}</p>
            )}
          </>
        }
        actions={
          canDecide ? (
            <>
              <Button variant="primary" onClick={() => ask("approve")}>
                {t("decision.confirm.approve")}
              </Button>
              <Button variant="secondary" onClick={() => ask("reject")}>
                {t("decision.confirm.reject")}
              </Button>
              {canSendBack(request) && (
                <Button variant="secondary" onClick={() => ask("return")}>
                  {t("decision.confirm.return")}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <DecisionSheet target={target} onClose={() => setTarget(null)} onDone={() => navigate(back)} />
    </>
  );
}
