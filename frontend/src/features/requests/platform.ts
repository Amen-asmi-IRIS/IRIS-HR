import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { workspaceOfPath } from "@/app/navigation";
import type { WorkspaceId } from "@/app/workspaces";
import { useCurrentUser } from "@/features/auth/api";
import { useLang, type Lang } from "@/i18n";
import type { ViewerRelation } from "./types";

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** A list read the same way whether it arrives bare (configuration lists) or paginated. */
export function rowsOf<T>(data: T[] | Paginated<T> | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results;
}

/** `t` in the shape every helper of this feature takes. A key of another namespace is written "namespace:key". */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The `requests` texts and the active language. */
export function useRequestsText(): { t: Translate; lang: Lang } {
  const { t } = useTranslation("requests");
  const lang = useLang();
  const translate = useCallback<Translate>((key, options) => String(t(key, options ?? {})), [t]);
  return { t: translate, lang };
}

export interface Viewer {
  publicId: string;
  name: string;
  workspaces: WorkspaceId[];
}

/** The signed-in person, for pages behind the shell's guards. */
export function useViewer(): Viewer {
  const me = useCurrentUser();
  return { publicId: me.public_id, name: me.name, workspaces: me.workspaces as WorkspaceId[] };
}

const PREFERENCE: Record<ViewerRelation, WorkspaceId[]> = {
  owner: ["me"],
  // Never Overview: it is read-only, and a decision could not be taken there.
  approver: ["team", "hr", "me"],
  team: ["team", "overview", "hr", "me"],
  hr: ["hr", "me"],
  overview: ["overview", "me"],
};

/** The workspace in which this viewer should see a request. Never one they do not have. */
export function workspaceFor(relation: ViewerRelation, workspaces: readonly WorkspaceId[]): WorkspaceId {
  return PREFERENCE[relation].find((id) => workspaces.includes(id)) ?? workspaces[0] ?? "me";
}

const WITH_REQUESTS: WorkspaceId[] = ["me", "team", "hr", "overview"];

/** The workspace of the current address: "/hr/requests/abc" -> "hr". "me" outside those that show requests. */
export function useWorkspacePrefix(): WorkspaceId {
  const workspace = workspaceOfPath(useLocation().pathname);
  return workspace !== null && WITH_REQUESTS.includes(workspace) ? workspace : "me";
}
