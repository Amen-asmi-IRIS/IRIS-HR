import { useState } from "react";
import { EmptyState, PageHeader } from "@/components";
import { AddFileSheet } from "../AddFileSheet";
import { useApprovals } from "../api";
import { DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { ReclassifySheet } from "../hr/actions/ReclassifySheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, RequestAction, RequestOut } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

type Task = "attach" | "reclassify";

/** /hr/certificates (UI 7.3): the sick leaves still without their certificate. */
export default function CertificatesPage() {
  const { t } = useRequestsText();
  const query = useApprovals({ queue: "certificates", page_size: QUEUE_PAGE_SIZE });
  // The request a sheet is about stays in place while the sheet closes.
  const [subject, setSubject] = useState<RequestOut | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  const can = (item: ApprovalItem, action: RequestAction) => item.request.viewer.actions.includes(action);
  const start = (item: ApprovalItem, next: Task) => {
    setSubject(item.request);
    setTask(next);
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

  return (
    <>
      <PageHeader title={t("queues.certificates.title")} back="/hr" />
      <QueueTable
        label={t("queues.certificates.title")}
        query={query}
        columns={["who", "when", "due", "overdue"]}
        actions={(item) => (
          <>
            {can(item, "attach") && (
              <RowButton onClick={() => start(item, "attach")}>{t("queues.certificates.attach")}</RowButton>
            )}
            {can(item, "reclassify") && (
              <RowButton onClick={() => start(item, "reclassify")}>{t("queues.certificates.reclassify")}</RowButton>
            )}
            {can(item, "decide") && (
              <RowButton onClick={() => setTarget({ request: item.request, stepId: item.step_id, decision: "reject" })}>
                {t("decision.confirm.reject")}
              </RowButton>
            )}
          </>
        )}
        empty={<EmptyState title={t("queues.certificates.empty")} />}
      />
      {subject && (
        <>
          <AddFileSheet
            key={subject.public_id}
            open={task === "attach"}
            onOpenChange={close}
            requestId={subject.public_id}
            title={t("queues.certificates.attachTitle", { name: subject.employee.name })}
            label={t("form.certificate")}
          />
          <ReclassifySheet open={task === "reclassify"} onOpenChange={close} request={subject} />
        </>
      )}
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
