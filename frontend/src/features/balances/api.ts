import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { AdjustmentPayload, Balance, LedgerLine, LedgerPage } from "@/api/types";
import { AFFECTED_KEYS, requestKeys } from "@/features/requests/api";

export type { Balance, LedgerLine, LedgerPage };
export type AdjustmentKind = "opening" | "adjustment";
export type AdjustmentInput = Omit<AdjustmentPayload, "kind"> & { kind: AdjustmentKind };

export const balanceKeys = {
  all: ["balances"] as const,
  employee: (employeeId: string) => ["balances", employeeId] as const,
  figures: (employeeId: string) => ["balances", employeeId, "figures"] as const,
  on: (employeeId: string, on: string) => ["balances", employeeId, "on", on] as const,
  ledger: (employeeId: string, page: number) => ["balances", employeeId, "ledger", page] as const,
};

// A request sent, decided, withdrawn, changed or cancelled moves the days held and the days approved:
// every balance on screen is read again (master 13.3).
AFFECTED_KEYS.push(balanceKeys.all);

/** The figures of one employee. Disabled until the employee is known. */
export function useBalance(employeeId: string | undefined) {
  return useQuery({
    queryKey: balanceKeys.figures(employeeId ?? ""),
    enabled: Boolean(employeeId),
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}", {
          params: { path: { employee_public_id: employeeId as string } },
        }),
      ),
  });
}

/** The same figures with the balance on a chosen date. Disabled until a date is chosen. */
export function useBalanceOn(employeeId: string, on: string | undefined) {
  return useQuery({
    queryKey: balanceKeys.on(employeeId, on ?? ""),
    enabled: Boolean(on),
    retry: false,
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}", {
          params: { path: { employee_public_id: employeeId }, query: { on: on as string } },
        }),
      ),
  });
}

/** One page of the history, newest first. The previous page stays on screen while the next loads. */
export function useLedger(employeeId: string, page: number) {
  return useQuery({
    queryKey: balanceKeys.ledger(employeeId, page),
    placeholderData: keepPreviousData,
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}/ledger", {
          params: { path: { employee_public_id: employeeId }, query: { page } },
        }),
      ),
  });
}

/**
 * Posts an opening balance or an adjustment, then refreshes everything shown about this employee's balance,
 * and the requests, whose form and decision views show the balance too.
 */
export function useAdjustBalance(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustmentInput) =>
      call(
        api.POST("/api/v1/balances/{employee_public_id}/adjustments", {
          params: { path: { employee_public_id: employeeId } },
          body,
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: balanceKeys.employee(employeeId) }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]),
  });
}
