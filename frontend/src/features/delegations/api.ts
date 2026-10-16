import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { Delegation, NewDelegation } from "@/api/types";

export type { Delegation, NewDelegation };

export interface DelegationListParams {
  scope?: "mine" | "all";
  manager?: string;
}

export const delegationKeys = {
  all: ["delegations"] as const,
  list: (params: DelegationListParams) => ["delegations", "list", params] as const,
};

export function useDelegations(params: DelegationListParams = {}, enabled = true) {
  return useQuery({
    queryKey: delegationKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/delegations", { params: { query: params } })),
    enabled,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  // A delegation changes who sees which team, so employee lists are refreshed too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: delegationKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["employees"] }),
    ]);
}

export function useCreateDelegation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: NewDelegation) => call(api.POST("/api/v1/delegations", { body })),
    onSuccess: refresh,
  });
}

export function useEndDelegation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (publicId: string) =>
      call(api.POST("/api/v1/delegations/{public_id}/end", { params: { path: { public_id: publicId } } })),
    onSuccess: refresh,
  });
}
