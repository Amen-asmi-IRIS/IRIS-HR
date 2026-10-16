import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { awayWithData, ProblemError } from "@/api/problem";
import { NotAvailable, PageLoading, SomethingWentWrong } from "@/components";

interface GateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /**
   * The children hold a form or a sheet over this reading. A later reading that fails only because the application
   * is away then leaves them drawn, with what was typed in them (master 13.1).
   */
  form?: boolean;
}

/**
 * Loading, "not available" (404 and 403 alike, UI 3.4) or "something went wrong" around one query.
 * Plan 01b's pages throw the error to the shell's boundary; this component shows the same two
 * pages in place, so that it also serves a block inside a page and a page rendered alone in a test.
 * An outage (the application away, being updated) is still thrown: the boundary says so and reads
 * again by itself, which a page drawn in place could not.
 */
export function Gate<T>({ query, children, form = false }: GateProps<T>) {
  if (query.isPending) return <PageLoading />;
  if (query.isError) {
    const error = query.error;
    if (form && awayWithData(query)) return <>{children(query.data as T)}</>;
    if (error instanceof ProblemError && (error.status === 404 || error.status === 403)) return <NotAvailable />;
    if (error instanceof ProblemError && error.unavailable) throw error;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }
  return <>{children(query.data)}</>;
}
