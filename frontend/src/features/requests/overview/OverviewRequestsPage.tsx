import { EmptyState, PageHeader } from "@/components";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

/** /overview/requests (UI 8.3): every request, as HR lists them, with no action at all. */
export default function OverviewRequestsPage() {
  const { t } = useRequestsText();
  return (
    <>
      <PageHeader title={t("overviewList.title")} />
      <RequestsList
        label={t("overviewList.title")}
        scope="all"
        columns={["who", "department", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        moreFilters={["department", "type", "on_behalf", "has_override"]}
        empty={<EmptyState title={t("overviewList.empty")} hint={t("overviewList.emptyHint")} />}
      />
    </>
  );
}
