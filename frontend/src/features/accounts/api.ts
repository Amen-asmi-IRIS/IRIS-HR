import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { AccountCreate, AccountDetail, AccountQuery } from "@/api/types";
import type { AssignableRole } from "./createAccountForm";

export const accountKeys = {
  all: ["accounts"] as const,
  status: ["accounts", "status"] as const,
  list: (query: Record<string, string | number>) => ["accounts", "list", query] as const,
  detail: (id: string) => ["accounts", "detail", id] as const,
};

/** Health, accounts needing attention, scheduled work and backup, refreshed every minute. */
export function useAdminStatus() {
  return useQuery({
    queryKey: accountKeys.status,
    queryFn: () => call(api.GET("/api/v1/admin/status")),
    refetchInterval: 60_000,
  });
}

/** A page of accounts. `query` comes from the address as plain strings; the API validates it. */
export function useAccounts(query: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: accountKeys.list(query),
    queryFn: () => call(api.GET("/api/v1/accounts", { params: { query: query as unknown as AccountQuery } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AccountCreate) => call(api.POST("/api/v1/accounts", { body })),
    // The answer carries the temporary password: it must not outlive the page that shows it.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: () => call(api.GET("/api/v1/accounts/{public_id}", { params: { path: { public_id: id } } })),
  });
}

export function useResetPassword(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST("/api/v1/accounts/{public_id}/reset-password", { params: { path: { public_id: id } } })),
    // As for creation: the temporary password stays in the page's state only.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

/** A change that answers with the account: the page shows the new state at once, the lists are read again. */
function useAccountChange<V>(id: string, change: (variables: V) => Promise<AccountDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: (account) => {
      queryClient.setQueryData(accountKeys.detail(id), account);
      void queryClient.invalidateQueries({ queryKey: accountKeys.all, predicate: (query) => query.queryKey[1] !== "detail" });
    },
  });
}

export function useAccountAction(id: string) {
  const options = { params: { path: { public_id: id } } };
  return useAccountChange(id, (action: "disable" | "enable" | "unlock") => {
    if (action === "disable") return call(api.POST("/api/v1/accounts/{public_id}/disable", options));
    if (action === "enable") return call(api.POST("/api/v1/accounts/{public_id}/enable", options));
    return call(api.POST("/api/v1/accounts/{public_id}/unlock", options));
  });
}

export function useAddRole(id: string) {
  return useAccountChange(id, (role: AssignableRole) => call(api.POST("/api/v1/accounts/{public_id}/roles", { params: { path: { public_id: id } }, body: { role } })));
}

export function useRemoveRole(id: string) {
  return useAccountChange(id, (role: AssignableRole) => call(api.DELETE("/api/v1/accounts/{public_id}/roles/{role}", { params: { path: { public_id: id, role } } })));
}
