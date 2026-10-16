import { useState } from "react";
import { EmptyState, PageHeader } from "@/components";
import { useApprovals } from "../api";
import { ReassignSheet } from "../hr/actions/ReassignSheet";
import { RecordOnBehalfSheet } from "../hr/actions/RecordOnBehalfSheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, RequestAction } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

type Task = "record" | "reassign";

/** /hr/stuck (UI 7.4): the steps HR was alerted about because nobody decides them. */
export default function StuckPage() {
  const { t } = useRequestsText();
  const query = useApprovals({ queue: "stuck", page_size: QUEUE_PAGE_SIZE });
  const [subject, setSubject] = useState<ApprovalItem | null>(null);
  const [task, setTask] = useState<Task | null>(null);

  const can = (item: ApprovalItem, action: RequestAction) => item.request.viewer.actions.includes(action);
  const start = (item: ApprovalItem, next: Task) => {
    setSubject(item);
    setTask(next);
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

  return (
    <>
      <PageHeader title={t("queues.stuck.title")} back="/hr" />
      <QueueTable
        label={t("queues.stuck.title")}
        query={query}
        columns={["who", "type", "when", "waitingOn", "since"]}
        actions={(item) => (
          <>
            {can(item, "record_on_behalf") && (
              <RowButton onClick={() => start(item, "record")}>{t("queues.stuck.record")}</RowButton>
            )}
            {can(item, "reassign") && (
              <RowButton onClick={() => start(item, "reassign")}>{t("queues.stuck.reassign")}</RowButton>
            )}
          </>
        )}
        empty={<EmptyState title={t("queues.stuck.empty")} />}
      />
      {subject && (
        <>
          <RecordOnBehalfSheet
            open={task === "record"}
            onOpenChange={close}
            request={subject.request}
            stepId={subject.step_id}
          />
          <ReassignSheet open={task === "reassign"} onOpenChange={close} request={subject.request} stepId={subject.step_id} />
        </>
      )}
    </>
  );
}
