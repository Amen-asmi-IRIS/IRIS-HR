import { useState } from "react";
import { EmptyState, PageHeader } from "@/components";
import { useApprovals } from "../api";
import { ManagerDelegateSheet } from "../hr/actions/ManagerDelegateSheet";
import { openStep } from "../hr/actions/ActionSheet";
import { ReassignSheet } from "../hr/actions/ReassignSheet";
import { RecordOnBehalfSheet } from "../hr/actions/RecordOnBehalfSheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, RequestAction } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

type Task = "record" | "reassign" | "delegate";

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
            {/* A delegate is named for a manager; a step that waits for a named person is given to someone else. */}
            {openStep(item.request).key === "waiting_manager" && (
              <RowButton onClick={() => start(item, "delegate")}>{t("queues.stuck.delegate")}</RowButton>
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
          <ManagerDelegateSheet
            open={task === "delegate"}
            onOpenChange={close}
            employeeId={subject.request.employee.public_id}
          />
        </>
      )}
    </>
  );
}
