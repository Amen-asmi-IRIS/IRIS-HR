import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, call } from "@/api/client";
import type { WorkspaceSummary } from "@/api/types";
import type { WorkspaceId } from "@/app/workspaces";

export const workspaceCountKeys = {
  summary: ["workspaces", "summary"] as const,
};

/**
 * How many things wait in each workspace, for the switcher (UI 3.2). Empty until the server has answered.
 * With `enabled` false (a person with a single workspace sees no switcher) nothing is read.
 */
export function useWorkspaceCounts(enabled = true): Partial<Record<WorkspaceId, number>> {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: workspaceCountKeys.summary,
    queryFn: async (): Promise<WorkspaceSummary> => call(api.GET("/api/v1/workspaces/summary")),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled,
  });

  // Any action that succeeded, in any feature, may have changed what waits somewhere.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        void queryClient.invalidateQueries({ queryKey: workspaceCountKeys.summary });
      }
    });
  }, [enabled, queryClient]);

  return enabled ? (data ?? {}) : {};
}
