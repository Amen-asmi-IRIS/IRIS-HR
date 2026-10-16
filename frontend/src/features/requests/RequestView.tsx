import type { ReactNode } from "react";
import type { To } from "react-router";
import { Disclosure, PageHeader } from "@/components";
import { useRequestsText } from "./platform";
import { nextStep } from "./status";
import { StatusSentence } from "./StatusSentence";
import { describeQuantity, describeWhen, SEPARATOR } from "./text";
import type { RequestDetail } from "./types";
import { AmendmentList, FileList, HistoryList, StepList } from "./views/parts";

export interface RequestViewProps {
  request: RequestDetail;
  back: To;
  /** What this viewer needs in order to decide, shown in the summary. */
  context?: ReactNode;
  /** The actions available now. The first may be the page's one primary action. */
  actions?: ReactNode;
  /** Show the comment in the summary instead of one step away (manager and HR views). */
  commentFirst?: boolean;
  /**
   * The view shows the files and where the document stands itself, in the summary (HR view): no files block
   * one step away, and no certificate sentence beside the state.
   */
  filesFirst?: boolean;
  /** Further "one step away" blocks. */
  extra?: ReactNode;
}

/**
 * The body of a request page for every role (M6): first a summary with where the request stands
 * and the actions available; steps, comment and files, changes and history one step away.
 * It renders what the API returned and nothing else: a comment or a file the viewer may not see
 * is simply absent from `request`.
 */
export function RequestView({
  request,
  back,
  context,
  actions,
  commentFirst = false,
  filesFirst = false,
  extra,
}: RequestViewProps) {
  const { t, lang } = useRequestsText();
  const mine = request.viewer.relation === "owner";
  const next = nextStep(request, t);
  const hasComment = request.comment !== null && request.comment !== "";
  const showCommentAndFiles = !filesFirst && (request.attachments.length > 0 || (hasComment && !commentFirst));
  const filesTitle = mine ? "view.myCommentAndFiles" : commentFirst ? "view.files" : "view.commentAndFiles";

  return (
    <>
      <PageHeader title={request.type.name} back={back} />
      <section aria-label={t("view.summary")} className="rounded-xl border border-border bg-card px-6 py-5">
        {!mine && (
          <p className="text-body">
            <span className="font-semibold">{request.employee.name}</span>
            <span className="text-muted-foreground">{SEPARATOR + request.employee.department}</span>
          </p>
        )}
        <p className="text-section font-semibold">{describeWhen(request, t, lang)}</p>
        <p className="text-body text-text-secondary">
          {describeQuantity(request, lang)}
          {request.event ? SEPARATOR + t("view.event", { name: request.event.name }) : ""}
        </p>
        <div className="mt-3">
          <StatusSentence request={request} detail withoutCertificate={filesFirst} />
        </div>
        {next && <p className="mt-2 text-body text-text-secondary">{next}</p>}
        {request.has_override && <p className="mt-2 text-caption text-muted-foreground">{t("view.exception")}</p>}
        {request.created_by_hr && !request.has_override && (
          <p className="mt-2 text-caption text-muted-foreground">{t("view.enteredByHr")}</p>
        )}
        {commentFirst && hasComment && (
          <div className="mt-3">
            <h2 className="text-caption font-medium text-muted-foreground">{t("view.comment")}</h2>
            <p className="text-body">{request.comment}</p>
          </div>
        )}
        {context}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </section>

      <div className="mt-4 flex flex-col gap-2">
        <Disclosure title={t("view.steps")}>
          <StepList steps={request.steps} />
        </Disclosure>
        {showCommentAndFiles && (
          <Disclosure title={t(filesTitle)}>
            {hasComment && !commentFirst && <p className="mb-3 text-body">{request.comment}</p>}
            <FileList attachments={request.attachments} />
          </Disclosure>
        )}
        {request.amendments.length > 0 && (
          <Disclosure title={t("view.changes")}>
            <AmendmentList amendments={request.amendments} unit={request.type.unit} />
          </Disclosure>
        )}
        <Disclosure title={t("view.history")}>
          <HistoryList id={request.public_id} />
        </Disclosure>
        {extra}
      </div>
    </>
  );
}
