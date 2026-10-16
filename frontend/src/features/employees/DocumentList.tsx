import { useTranslation } from "react-i18next";

import { DownloadLink, StatusBadge } from "@/components";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useEmployeeDocuments, useSetDocumentVisibility } from "./api";

interface Props {
  employeeId: string;
  /** "manage": a checkbox per document (HR). "show": the sharing state as text. "hide": nothing (the employee). */
  sharing: "manage" | "show" | "hide";
}

export function DocumentList({ employeeId, sharing }: Props) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const documents = useEmployeeDocuments(employeeId);
  const share = useSetDocumentVisibility(employeeId);
  const rows = documents.data ?? [];

  if (documents.isPending) {
    return <p role="status">{t("record.loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("documents.empty")}</p>;
  }
  return (
    <ul className="divide-y divide-divider">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <DownloadLink
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={`/api/v1/attachments/${row.attachment.public_id}/download`}
              aria-label={t("documents.download", { name: row.label })}
            >
              {row.label}
            </DownloadLink>
            <p className="text-caption text-muted-foreground">
              {row.attachment.name}
              {row.added_by
                ? ` · ${t("documents.addedBy", {
                    name: row.added_by,
                    date: formatDateTime(row.added_at, lang),
                  })}`
                : ""}
            </p>
          </div>
          {sharing === "manage" ? (
            <label className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={row.visible_to_employee}
                aria-label={t("documents.share", { label: row.label })}
                onChange={(event) => share.mutate({ id: row.id, visible_to_employee: event.target.checked })}
              />
              <span aria-hidden="true">{t("documents.shareShort")}</span>
            </label>
          ) : null}
          {sharing === "show" ? (
            <StatusBadge tone={row.visible_to_employee ? "info" : "neutral"}>
              {t(row.visible_to_employee ? "documents.shared" : "documents.notShared")}
            </StatusBadge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
