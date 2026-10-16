import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { AuditQuery } from "@/api/types";

export type AuditCategory = "security" | "business";

export const auditKeys = {
  all: ["audit"] as const,
  list: (category: AuditCategory, query: Record<string, string | number>) => ["audit", category, query] as const,
};

/** A page of the security log or of the activity log. `query` comes from the address; the API validates it. */
export function useAuditEvents(category: AuditCategory, query: Record<string, string | number>) {
  return useQuery({
    queryKey: auditKeys.list(category, query),
    queryFn: () => {
      const options = { params: { query: query as unknown as AuditQuery } };
      return category === "security" ? call(api.GET("/api/v1/audit/security", options)) : call(api.GET("/api/v1/audit/business", options));
    },
    placeholderData: keepPreviousData,
  });
}

/** The address of the Excel export of the filtered list. The API records each export. */
export function auditExportUrl(category: AuditCategory, filters: Record<string, string>): string {
  const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString();
  return `/api/v1/audit/${category}/export${search ? `?${search}` : ""}`;
}
