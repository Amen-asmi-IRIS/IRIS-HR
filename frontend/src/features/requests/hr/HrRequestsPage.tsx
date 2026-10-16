import { Link } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

/** /hr/requests (UI 7.6): every request. Six attributes, three filters, four more one step away. */
export default function HrRequestsPage() {
  const { t } = useRequestsText();
  return (
    <>
      <PageHeader
        title={t("hrList.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/hr/requests/new">{t("hrList.new")}</Link>
          </Button>
        }
      />
      <RequestsList
        label={t("hrList.title")}
        scope="all"
        columns={["who", "department", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        moreFilters={["department", "type", "on_behalf", "has_override"]}
        empty={<EmptyState title={t("hrList.empty")} hint={t("hrList.emptyHint")} />}
      />
    </>
  );
}
