import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { EmployeeDetail } from "@/features/employees/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useProfileChanges } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";
import { ProposalSheet } from "./ProposalSheet";

/** The change proposals of one employee, on the HR record. */
export function ProposalsBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const list = useProfileChanges({ scope: "all", employee: employee.public_id });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = list.data?.results ?? [];
  const open = rows.find((row) => row.public_id === openId) ?? null;

  if (list.isPending) {
    return <p role="status">{t("loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("record.empty")}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-divider">
        {rows.map((row) => (
          <li key={row.public_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-body">{row.changes.map((item) => text.label(item.field)).join(", ")}</p>
              <p className="text-caption text-muted-foreground">
                {t("proposals.sent", { date: formatDateTime(row.created_at, lang) })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <OutcomeBadge status={row.status} />
              <Button
                type="button"
                size="sm"
                aria-label={t("queue.openFor", { name: row.employee.name })}
                onClick={() => setOpenId(row.public_id)}
              >
                {t("queue.open")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ProposalSheet change={open} onClose={() => setOpenId(null)} />
    </>
  );
}
