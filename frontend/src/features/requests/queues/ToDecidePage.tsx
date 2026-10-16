import { Link } from "react-router";
import { PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequestsText } from "../platform";
import { ToDecideBlock, useToDecide } from "./ToDecideBlock";

/** /team : the manager's queue. Primary action: decide the oldest request (UI 6.1). */
export default function ToDecidePage() {
  const { t } = useRequestsText();
  const { items } = useToDecide();
  const oldest = items[0];
  return (
    <>
      <PageHeader
        title={t("toDecide.pageTitle")}
        primary={
          oldest ? (
            <Button asChild variant="primary">
              <Link to={`/team/requests/${oldest.request.public_id}`}>{t("toDecide.decideOldest")}</Link>
            </Button>
          ) : undefined
        }
      />
      <ToDecideBlock hideTitle />
    </>
  );
}
