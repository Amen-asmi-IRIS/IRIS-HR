import { Link } from "react-router";
import { backToList } from "@/components";
import { DecisionContextView } from "../decisions/DecisionContext";
import { useRequestsText, useViewer, workspaceFor } from "../platform";
import { RequestView } from "../RequestView";
import type { RequestDetail } from "../types";

/**
 * A request seen from Overview (UI 8.3): everything an executive may read, and no action.
 * `RequestPage` shows this view for every request opened under /overview, whatever the viewer
 * could do with it elsewhere; one who can decide is told where.
 */
export default function RequestOverviewView({ request }: { request: RequestDetail }) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const decides = request.viewer.actions.includes("decide");
  // Where this viewer decides: My team or My space for an approver, the HR desk for an HR holder.
  const elsewhere = workspaceFor(request.viewer.relation, viewer.workspaces);

  return (
    <RequestView
      request={request}
      back={backToList("/overview/requests")}
      commentFirst
      context={
        <>
          <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
          {decides && (
            <p className="mt-3 text-body text-text-secondary">
              {t("overviewView.decideElsewhere")}{" "}
              <Link
                to={`/${elsewhere}/requests/${request.public_id}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {t("overviewView.openToDecide")}
              </Link>
            </p>
          )}
        </>
      }
    />
  );
}
