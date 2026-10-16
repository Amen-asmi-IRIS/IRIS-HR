import { useState } from "react";
import { EmptyState, FilterBar, FilterSelect, PageHeader, useListParams } from "@/components";
import { useApprovals, useDepartmentOptions, useRequestTypes } from "../api";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, CertificateStatus, Decision } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

const DOCUMENT_STATUSES: CertificateStatus[] = ["attached", "due", "overdue", "missing", "not_needed"];

/** /hr/validate (UI 7.2): the requests waiting for HR, decided from the row or opened. */
export default function ToValidatePage() {
  const { t, lang } = useRequestsText();
  const params = useListParams({ type: "", department: "", document: "" });
  const types = useRequestTypes();
  const departments = useDepartmentOptions(lang);
  const query = useApprovals({
    queue: "hr",
    type: params.filters.type,
    department: params.filters.department,
    page_size: QUEUE_PAGE_SIZE,
  });
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  // The API filters a queue by type and department; the document status is read from the rows.
  const wanted = params.filters.document;
  const items = (query.data?.results ?? []).filter(
    (item) => wanted === "" || item.request.certificate?.status === wanted,
  );
  const filtered = Object.values(params.filters).some((value) => value !== "");
  const all = { value: "", label: t("common.all") };
  const ask = (item: ApprovalItem, decision: Decision) =>
    setTarget({ request: item.request, stepId: item.step_id, decision });

  return (
    <>
      <PageHeader title={t("queues.validate.title")} back="/hr" />
      <FilterBar>
        <FilterSelect
          label={t("filters.typeLabel")}
          value={params.filters.type}
          onChange={(value) => params.setFilter("type", value)}
          options={[all, ...(types.data ?? []).map((type) => ({ value: type.code, label: type.name }))]}
        />
        <FilterSelect
          label={t("filters.department")}
          value={params.filters.department}
          onChange={(value) => params.setFilter("department", value)}
          options={[all, ...(departments.data ?? [])]}
        />
        <FilterSelect
          label={t("queues.validate.documentFilter")}
          value={wanted}
          onChange={(value) => params.setFilter("document", value)}
          options={[all, ...DOCUMENT_STATUSES.map((status) => ({ value: status, label: t(`queues.documentOption.${status}`) }))]}
        />
      </FilterBar>
      <QueueTable
        label={t("queues.validate.title")}
        query={query}
        items={items}
        columns={["who", "department", "type", "when", "quantity", "document"]}
        actions={(item) =>
          item.request.viewer.actions.includes("decide") ? (
            <>
              <RowButton onClick={() => ask(item, "approve")}>{t("decision.confirm.approve")}</RowButton>
              <RowButton onClick={() => ask(item, "reject")}>{t("decision.confirm.reject")}</RowButton>
              {canSendBack(item.request) && (
                <RowButton onClick={() => ask(item, "return")}>{t("decision.confirm.return")}</RowButton>
              )}
            </>
          ) : null
        }
        empty={<EmptyState title={t("queues.validate.empty")} hint={filtered ? t("queues.emptyHint") : undefined} />}
      />
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
