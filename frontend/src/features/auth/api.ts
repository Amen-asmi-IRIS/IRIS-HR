import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/api/client";
import { ProblemError } from "@/api/problem";
import type { Credentials, Me, MeChanges, PasswordChange } from "@/api/types";
import { forgetLists } from "@/components/useListParams";
import { forgetRequestForms } from "@/features/requests/form/draftKeeper";
import { markSignedIn, markSignedOut, runBeforeSignOut } from "./session";

export const meKey = ["auth", "me"] as const;

/** The signed-in user, or null when nobody is signed in. An outage is thrown, not turned into null. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await call(api.GET("/api/v1/auth/me"));
  } catch (error) {
    if (error instanceof ProblemError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 5 * 60_000 });
}

/**
 * The user, for pages behind RequireAuth.
 *
 * When the session ends (sign-out, or a 401 on any call) the cache holds nobody, and a page may be drawn once
 * more before RequireAuth takes it away. For that one drawing it keeps the user it had, instead of failing.
 */
export function useCurrentUser(): Me {
  const { data } = useMe();
  const [last, setLast] = useState<Me | null>(data ?? null);
  if (data && data !== last) setLast(data);
  const user = data ?? last;
  if (!user) throw new Error("useCurrentUser is only for pages behind RequireAuth.");
  return user;
}

export function signIn(credentials: Credentials): Promise<Me> {
  return call(api.POST("/api/v1/auth/login", { body: credentials }));
}

export function updateMe(changes: MeChanges): Promise<Me> {
  return call(api.PATCH("/api/v1/auth/me", { body: changes }));
}

function dropEverythingButTheSession(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" && query.queryKey[0] !== "health" });
}

/** Puts the user in the cache: from here on the application is signed in. */
export function completeSignIn(queryClient: QueryClient, me: Me): void {
  markSignedIn();
  dropEverythingButTheSession(queryClient);
  queryClient.setQueryData(meKey, me);
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => {
      // The shell sends "remember this workspace" on its own. If the user signed out before the answer came,
      // the answer must not put them back.
      if (queryClient.getQueryData(meKey) !== null) queryClient.setQueryData(meKey, me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // What the user did just before (a draft discarded, a request withdrawn) is carried out while still signed in.
      await runBeforeSignOut();
      return call(api.POST("/api/v1/auth/logout"));
    },
    onSuccess: () => {
      markSignedOut();
      // A reading of the user that is still on its way was made while signed in: its answer is dropped.
      void queryClient.cancelQueries({ queryKey: meKey });
      queryClient.setQueryData(meKey, null);
      dropEverythingButTheSession(queryClient);
      // What was typed in the filters of a list (a name, often) is not left in the browser either.
      forgetLists();
      // Nor what was typed in a request form that was never saved (plan 03b, master D34).
      forgetRequestForms();
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PasswordChange) => call(api.POST("/api/v1/auth/password", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

/** Public. Used before sign-in to know which stack this is. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"] as const,
    queryFn: () => call(api.GET("/api/v1/health")),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
