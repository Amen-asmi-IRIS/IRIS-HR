import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { Notification } from "@/api/types";

interface ListParams {
  unread: boolean;
  page: number;
  pageSize: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread-count"] as const,
  list: (params: ListParams) => ["notifications", "list", params] as const,
};

/**
 * A notification link is followed only when it stays inside the application. The rule is the one of `safeNext`
 * (app/guards.tsx): a browser reads a backslash as a slash and drops tabs and line breaks.
 */
export function isInsideLink(link: string): boolean {
  if (!link.startsWith("/") || link.startsWith("//")) return false;
  for (const character of link) {
    const code = character.charCodeAt(0);
    if (character === "\\" || code < 32 || code === 127) return false;
  }
  return true;
}

/** Unread notifications across all workspaces, refreshed every minute. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => call(api.GET("/api/v1/notifications/unread-count")),
    select: (data) => data.count,
    refetchInterval: 60_000,
  });
}

export function useNotifications(params: ListParams, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () =>
      call(
        api.GET("/api/v1/notifications", {
          // The API reads `unread=true` as it reads `unread=1`.
          params: { query: { page: params.page, page_size: params.pageSize, ...(params.unread ? { unread: true } : {}) } },
        }),
      ),
    enabled,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Notification["id"]) => call(api.POST("/api/v1/notifications/{id}/read", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST("/api/v1/notifications/read-all")),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
