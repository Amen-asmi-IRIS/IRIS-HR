import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { Notification } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { isInsideLink, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from "./api";

const PAGE_SIZE = 25;

/** One list for the person, across all their workspaces (UI 10.1). */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const list = useListParams({ unread: "" });
  const unreadOnly = list.filters.unread === "1";
  const query = useNotifications({ unread: unreadOnly, page: list.page, pageSize: PAGE_SIZE });
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  if (query.error) throw query.error;
  const rows = query.data?.results ?? [];

  function openItem(item: Notification): void {
    if (!item.read_at) markRead.mutate(item.id);
    navigate(item.link);
  }

  return (
    <>
      <PageHeader
        title={t("notifications:title")}
        primary={
          (unread.data ?? 0) > 0 ? (
            <Button variant="primary" onClick={() => markAll.mutate()}>
              {t("notifications:markAllRead")}
            </Button>
          ) : undefined
        }
      />
      <FilterBar>
        <Button variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => list.setFilter("unread", unreadOnly ? "" : "1")}>
          {t("notifications:unreadOnly")}
        </Button>
      </FilterBar>
      {query.isPending && <PageLoading />}
      {!query.isPending && rows.length === 0 && <EmptyState title={unreadOnly ? t("notifications:emptyUnread") : t("notifications:empty")} />}
      {rows.length > 0 && (
        <ul aria-label={t("notifications:title")} className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
                  <span>{item.title}</span>
                  {!item.read_at && <StatusBadge tone="info">{t("notifications:unread")}</StatusBadge>}
                </p>
                <p className="text-body text-text-secondary">{item.body}</p>
                <p className="mt-1 text-caption text-muted-foreground">{formatDateTime(item.created_at, lang)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!item.read_at && (
                  <Button size="sm" variant="ghost" aria-label={t("notifications:markReadOf", { title: item.title })} onClick={() => markRead.mutate(item.id)}>
                    {t("notifications:markRead")}
                  </Button>
                )}
                {isInsideLink(item.link) && (
                  <Button size="sm" aria-label={t("notifications:openOf", { title: item.title })} onClick={() => openItem(item)}>
                    {t("actions.open")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageSize={PAGE_SIZE} total={query.data?.count ?? 0} onPage={list.setPage} />
    </>
  );
}
