import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { NewProfileChange, ProfileChange } from "@/api/types";

export type { NewProfileChange, ProfileChange };

export interface ProfileChangeListParams {
  scope?: "mine" | "all";
  status?: "pending" | "decided" | "accepted" | "rejected" | "withdrawn";
  employee?: string;
  page?: number;
}

export const profileChangeKeys = {
  all: ["profile-changes"] as const,
  list: (params: ProfileChangeListParams) => ["profile-changes", "list", params] as const,
};

export function useProfileChanges(params: ProfileChangeListParams, enabled = true) {
  return useQuery({
    queryKey: profileChangeKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/profile-changes", { params: { query: params } })),
    enabled,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  // An accepted proposal changes the employee record too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: profileChangeKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["employees"] }),
    ]);
}

export function useProposeProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: NewProfileChange) => call(api.POST("/api/v1/profile-changes", { body })),
    onSuccess: refresh,
  });
}

export function useDecideProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, accept, comment }: { id: string; accept: boolean; comment: string }) =>
      call(
        api.POST("/api/v1/profile-changes/{public_id}/decide", {
          params: { path: { public_id: id } },
          body: { accept, comment },
        }),
      ),
    // Refresh on failure too: a 409 means someone else decided, and the list must show it.
    onSettled: refresh,
  });
}

export function useWithdrawProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST("/api/v1/profile-changes/{public_id}/withdraw", { params: { path: { public_id: id } } })),
    onSettled: refresh,
  });
}
