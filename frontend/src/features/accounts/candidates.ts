import { useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";

import { accountKeys } from "./api";

/** The employees who have no account yet. Read again after an account is created (it shares the accounts key). */
export function useAccountCandidates() {
  return useQuery({
    queryKey: [...accountKeys.all, "candidates"] as const,
    queryFn: () => call(api.GET("/api/v1/accounts/candidates")),
  });
}
