import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { Notification } from "@/api/types";
import { PageLoading } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isInsideLink, useMarkRead, useNotifications, useUnreadCount } from "./api";

/** The unread count across all workspaces; opens the latest five (UI 3.3). */
export function NotificationsBell({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const latest = useNotifications({ unread: false, page: 1, pageSize: 5 }, open);
  const markRead = useMarkRead();

  const count = unread.data ?? 0;
  const rows = latest.data?.results ?? [];
  // French agrees with the number: "1 non lue", "3 non lues".
  const label =
    count === 0 ? t("notifications:bell.none") : count === 1 ? t("notifications:bell.unreadOne") : t("notifications:bell.unread", { total: count });

  function openItem(item: Notification): void {
    setOpen(false);
    if (!item.read_at) markRead.mutate(item.id);
    if (isInsideLink(item.link)) navigate(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          className={compact ? "relative" : "w-full justify-start"}
          aria-label={label}
        >
          <Bell aria-hidden="true" />
          {!compact && <span>{t("notifications:title")}</span>}
          {count > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "tabular rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground",
                compact ? "absolute -right-1 -top-1" : "ml-auto",
              )}
            >
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("notifications:latest")} side={compact ? "bottom" : "right"} align="end">
        <p className="px-2 py-1 text-caption font-medium text-muted-foreground">{t("notifications:latest")}</p>
        {latest.isPending && <PageLoading />}
        {!latest.isPending && rows.length === 0 && <p className="px-2 py-3 text-body text-muted-foreground">{t("notifications:empty")}</p>}
        {rows.length > 0 && (
          <ul className="flex flex-col">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                >
                  <span className={cn("text-body text-foreground", !item.read_at && "font-semibold")}>{item.title}</span>
                  <span className="text-caption text-muted-foreground">{item.body}</span>
                  <span className="text-caption text-muted-foreground">{formatDateTime(item.created_at, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 border-t border-divider px-2 pt-2 pb-1">
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-body font-semibold text-primary hover:underline">
            {t("notifications:seeAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
