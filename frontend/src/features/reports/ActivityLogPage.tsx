import { useTranslation } from "react-i18next";
import AuditLogPage from "@/features/audit/AuditLogPage";
import { actionLabel } from "@/features/audit/labels";
import { BUSINESS_ACTIONS, ITEM_TYPES } from "./activity";
import { useReportFilters } from "./api";

/**
 * The business audit (UI 7.11). The log page itself is plan 01b's; this gives it the people, the kinds
 * of event and the kinds of item to filter on. The people come from `report-filters`, which HR and
 * Executive Management may read: HR cannot list accounts.
 */
export default function ActivityLogPage() {
  const { t, i18n } = useTranslation();
  const options = useReportFilters("all");
  if (options.error) throw options.error;

  const actors = (options.data?.actors ?? []).map((actor) => ({ value: actor.public_id, label: actor.name }));
  const actionOptions = BUSINESS_ACTIONS.map((action) => ({ value: action, label: actionLabel(action, t, i18n) }));
  const itemTypeOptions = ITEM_TYPES.map((type) => ({ value: type, label: t(`reports:activity.items.${type}`) }));

  return <AuditLogPage category="business" actors={actors} actionOptions={actionOptions} itemTypeOptions={itemTypeOptions} />;
}
