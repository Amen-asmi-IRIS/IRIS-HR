import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Pager } from "@/components";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type EmployeeDetail, useEmployeeHistory } from "../api";

const PAGE_SIZE = 25;
// Fields whose stored value is a code with a translated label.
const CODED = { status: "status", contract_type: "contract", gender: "gender" } as const;

interface Change {
  before?: unknown;
  after?: unknown;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function HistoryBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const history = useEmployeeHistory(employee.public_id, page);
  const events = history.data?.results ?? [];

  const show = (field: string, value: unknown): string => {
    if (isBlank(value)) {
      return t("history.blank");
    }
    if (typeof value === "boolean") {
      return t(value ? "history.yes" : "history.no");
    }
    const group = CODED[field as keyof typeof CODED];
    return group ? t(`${group}.${String(value)}`, { defaultValue: String(value) }) : String(value);
  };

  if (history.isPending) {
    return <p role="status">{t("record.loading")}</p>;
  }
  if (events.length === 0) {
    return <p className="text-body text-muted-foreground">{t("history.empty")}</p>;
  }
  return (
    <>
      <ol className="grid gap-4">
        {events.map((event) => (
          <li key={event.id}>
            <p className="text-body font-medium">
              {t(`history.actions.${event.action}`, { defaultValue: event.action })}
            </p>
            <p className="text-caption text-muted-foreground">
              {t("history.by", {
                actor: event.actor ?? t("history.system"),
                date: formatDateTime(event.at, lang),
              })}
            </p>
            <ul className="mt-1 grid gap-0.5">
              {Object.entries((event.changes ?? {}) as Record<string, Change>)
                // A record is created with every field: one that went from nothing to nothing says nothing.
                .filter(([, change]) => !isBlank(change.before) || !isBlank(change.after))
                .map(([field, change]) => (
                  <li key={field} className="text-body">
                    {t("history.change", {
                      field: t(`fields.${field}`, { defaultValue: field }),
                      before: show(field, change.before),
                      after: show(field, change.after),
                    })}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
      <Pager page={page} pageSize={PAGE_SIZE} total={history.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
