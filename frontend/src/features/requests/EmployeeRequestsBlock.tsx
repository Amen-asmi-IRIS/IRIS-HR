import { Link } from "react-router";
import { EmptyState } from "@/components";
import { Button } from "@/components/ui/button";
import type { RecordMode } from "@/features/employees/recordBlocks";
import { RequestsList } from "./lists/RequestsList";
import { useRequestsText } from "./platform";

interface EmployeeRequestsBlockProps {
  employeeId: string;
  mode: RecordMode;
}

/**
 * The requests of one person, inside their record. HR and executives see every request of the
 * person; a manager sees what `scope=team` gives. A request opens in the workspace of the record.
 */
export function EmployeeRequestsBlock({ employeeId, mode }: EmployeeRequestsBlockProps) {
  const { t } = useRequestsText();
  return (
    <div className="flex flex-col gap-3">
      {mode === "hr" && (
        <div>
          <Button asChild variant="secondary">
            <Link to={`/hr/requests/new?employee=${encodeURIComponent(employeeId)}`}>{t("recordBlock.new")}</Link>
          </Button>
        </div>
      )}
      <RequestsList
        label={t("recordBlock.title")}
        scope={mode === "team" ? "team" : "all"}
        columns={["type", "when", "quantity", "status"]}
        filters={["status", "type", "year"]}
        fixed={{ employee: employeeId }}
        // The record around it opens sheets (a document, a departure).
        keepWhileAway
        empty={<EmptyState title={t("recordBlock.empty")} />}
      />
    </div>
  );
}
