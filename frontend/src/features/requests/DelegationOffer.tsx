import { Link } from "react-router";
import { todayISO } from "@/lib/dates";
import { useRequestsText, useViewer } from "./platform";
import type { RequestOut } from "./types";

/**
 * The offer made to a manager whose own leave is approved (UI 6.6): name a delegate for those
 * dates. It leads to plan 02's delegations page, which opens its sheet with the dates filled in.
 */
export function DelegationOffer({ request }: { request: RequestOut }) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const today = todayISO();
  const offered =
    viewer.workspaces.includes("team") &&
    request.status === "approved" &&
    request.type.calendar_label === "absent" &&
    request.end_date >= today;
  if (!offered) return null;
  const from = request.start_date < today ? today : request.start_date;
  return (
    <p className="mt-3 rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
      {t("delegationOffer.text")}{" "}
      <Link to={`/team/delegations?from=${from}&to=${request.end_date}`} className="font-medium underline underline-offset-2">
        {t("delegationOffer.action")}
      </Link>
    </p>
  );
}
