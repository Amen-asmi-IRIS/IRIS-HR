import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@/api/client";
import { makeQueryClient } from "@/api/queryClient";
import { Toaster } from "@/components/toast";
import { meKey } from "@/features/auth/api";

const applicationClient = makeQueryClient();

interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass their own client. */
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient = applicationClient }: AppProvidersProps) {
  useEffect(() => {
    // A 401 on any call means the session is over. Forgetting the user makes RequireAuth
    // send the page to Sign in, with the address to come back to.
    setUnauthorizedHandler(() => queryClient.setQueryData(meKey, null));
    return () => setUnauthorizedHandler(() => {});
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
