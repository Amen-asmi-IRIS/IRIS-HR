import { Link } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";
import { useUndoable } from "../undoable";

/** /me/requests (UI 5.2). Four attributes per request, three filters, one primary action. */
export default function MyRequestsPage() {
  const { t } = useRequestsText();
  const { discard } = useUndoable();
  return (
    <>
      <PageHeader
        title={t("list.mine.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("common.newRequest")}</Link>
          </Button>
        }
      />
      <RequestsList
        label={t("list.mine.title")}
        scope="mine"
        columns={["type", "when", "quantity", "status"]}
        filters={["status", "type", "year"]}
        empty={<EmptyState title={t("list.mine.empty")} hint={t("list.mine.emptyHint")} />}
        rowExtra={(request) =>
          request.viewer.actions.includes("discard") ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                discard(request);
              }}
            >
              {t("common.discard")}
            </Button>
          ) : null
        }
      />
    </>
  );
}
