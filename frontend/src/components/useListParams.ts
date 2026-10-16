import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";

const PREFIX = "iris.list:";

/** The address of a list with the filters it last had, for the back link of a detail page. */
export function backToList(path: string): string {
  try {
    return path + (sessionStorage.getItem(PREFIX + path) ?? "");
  } catch {
    return path;
  }
}

/** Signing out leaves nothing of the lists behind for the next person on this browser. */
export function forgetLists(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked; then nothing was kept either.
  }
}

export interface ListParams<F extends Record<string, string>> {
  filters: F;
  page: number;
  sort: string;
  /** Page, sort and non-empty filters, ready to pass to the API. */
  query: Record<string, string | number>;
  setFilter: (key: keyof F & string, value: string) => void;
  setPage: (page: number) => void;
  setSort: (sort: string) => void;
}

/** Filters, sort and page kept in the address, so they survive opening an item and coming back. */
export function useListParams<F extends Record<string, string>>(defaults: F): ListParams<F> {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname, search } = useLocation();

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + pathname, search);
    } catch {
      // Storage can be blocked; the back link then returns to the unfiltered list.
    }
  }, [pathname, search]);

  const filters = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof F & string)[]) {
    const value = searchParams.get(key);
    if (value !== null) filters[key] = value as F[keyof F & string];
  }
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page"))) || 1);
  const sort = searchParams.get("ordering") ?? "";

  function update(changes: Record<string, string | null>, keepPage: boolean): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "" || value === defaults[key]) next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  const query: Record<string, string | number> = { page };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  if (sort) query.ordering = sort;

  return {
    filters,
    page,
    sort,
    query,
    setFilter: (key, value) => update({ [key]: value }, false),
    setPage: (next) => update({ page: next <= 1 ? null : String(next) }, true),
    setSort: (next) => update({ ordering: next || null }, false),
  };
}
