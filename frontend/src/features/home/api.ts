import { useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { MeHomeWire, OverviewHome, TeamHome } from "@/api/types";
import { AFFECTED_KEYS } from "@/features/requests/api";
import type { RequestOut } from "@/features/requests/types";

export type { OverviewHome, TeamHome };

export interface NeedsYouItem {
  kind: "returned" | "certificate_due";
  request: RequestOut;
  due_at: string | null;
}

/** The My space home. Its requests carry plan 03b's request type, the one its components take. */
export interface MeHome {
  balance: MeHomeWire["balance"];
  needs_you: NeedsYouItem[];
  in_progress: RequestOut[];
  coming_up: RequestOut[];
}

export const homeKeys = {
  all: ["home"] as const,
  me: ["home", "me"] as const,
  team: ["home", "team"] as const,
  overview: ["home", "overview"] as const,
};

// A request that is sent, decided, changed or cancelled changes the homes: plan 03b reads these keys again.
AFFECTED_KEYS.push(homeKeys.all);

// A home is what a person opens to see the present state, so it is read again on every visit.
export function useMeHome() {
  return useQuery({
    queryKey: homeKeys.me,
    queryFn: () => call(api.GET("/api/v1/home/me")) as Promise<unknown> as Promise<MeHome>,
    refetchOnMount: "always",
  });
}

export function useTeamHome() {
  return useQuery({
    queryKey: homeKeys.team,
    queryFn: async (): Promise<TeamHome> => call(api.GET("/api/v1/home/team")),
    refetchOnMount: "always",
  });
}

export function useOverviewHome() {
  return useQuery({
    queryKey: homeKeys.overview,
    queryFn: async (): Promise<OverviewHome> => call(api.GET("/api/v1/home/overview")),
    refetchOnMount: "always",
  });
}
