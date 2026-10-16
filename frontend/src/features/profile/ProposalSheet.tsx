import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { TaskSheet, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useDecideProfileChange } from "./api";
import { useChangeText } from "./changeText";

interface Props {
  change: ProfileChange | null;
  onClose: () => void;
}

export function ProposalSheet({ change, onClose }: Props) {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const commentId = useId();
  const [comment, setComment] = useState("");
  const decide = useDecideProfileChange();

  const close = () => {
    setComment("");
    onClose();
  };
  const send = (accept: boolean) => {
    if (!change) {
      return;
    }
    decide.mutate(
      { id: change.public_id, accept, comment: comment.trim() },
      {
        onSuccess: () => {
          toast(t(accept ? "sheet.accepted" : "sheet.refused"));
          close();
        },
        onError: (error: unknown) => {
          toast(error instanceof ProblemError ? error.detail : t("sheet.failed"));
          if (error instanceof ProblemError && error.status === 409) {
            close();
          }
        },
      },
    );
  };

  const pending = change?.status === "pending";
  const cell = "border-b border-divider px-3 py-2 text-left text-body align-top";
  return (
    <TaskSheet
      open={change !== null}
      onOpenChange={(open: boolean) => {
        if (!open) {
          close();
        }
      }}
      title={change ? t("sheet.title", { name: change.employee.name }) : ""}
      footer={
        pending ? (
          <>
            <Button variant="primary" type="button" onClick={() => send(true)}>
              {t("sheet.accept")}
            </Button>
            <Button type="button" onClick={() => send(false)}>
              {t("sheet.refuse")}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={close}>
            {t("sheet.close")}
          </Button>
        )
      }
    >
      {change ? (
        <div className="grid gap-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.field")}
                </th>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.current")}
                </th>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.proposed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {change.changes.map((item) => (
                <tr key={item.field}>
                  <th scope="row" className={`${cell} font-medium`}>
                    {text.label(item.field)}
                  </th>
                  <td className={cell}>{text.value(item.field, item.old)}</td>
                  <td className={`${cell} font-medium`}>{text.value(item.field, item.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {change.note ? <p className="text-body">{t("sheet.note", { note: change.note })}</p> : null}
          {pending ? (
            <div className="grid gap-1.5">
              <label htmlFor={commentId} className="text-body font-medium">
                {t("sheet.comment")}
              </label>
              <textarea
                id={commentId}
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-body"
              />
            </div>
          ) : (
            <div className="grid gap-1 text-body">
              {change.decided_by && change.decided_at ? (
                <p>
                  {t("sheet.decidedBy", {
                    outcome: t(`outcome.${change.status}`),
                    name: change.decided_by,
                    date: formatDateTime(change.decided_at, lang),
                  })}
                </p>
              ) : (
                <p>{t(`outcome.${change.status}`)}</p>
              )}
              {change.comment ? <p>{t("sheet.hrComment", { comment: change.comment })}</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </TaskSheet>
  );
}
