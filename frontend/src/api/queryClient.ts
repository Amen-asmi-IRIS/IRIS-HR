import { QueryClient } from "@tanstack/react-query";
import { ProblemError } from "./problem";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A refusal will not change by asking again; an outage might.
        retry: (failures, error) => !(error instanceof ProblemError && error.status >= 400 && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  });
}
