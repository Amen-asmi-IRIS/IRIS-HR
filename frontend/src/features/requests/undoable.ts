import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "@/components";
import { registerBeforeSignOut } from "@/features/auth/session";
import { isConflict, refreshRequests, requestsApi } from "./api";
import { useRequestsText } from "./platform";
import type { RequestOut } from "./types";

export type PendingKind = "discard" | "withdraw";

interface Entry {
  kind: PendingKind;
  timer: ReturnType<typeof setTimeout>;
  commit: () => Promise<void>;
  /** Set once the action is being carried out: it can no longer be undone, and this says when it is done. */
  running: Promise<void> | null;
}

/** How long an action waits for an undo: the 5 s of `motion.duration.toast` in the design tokens. */
export const undoConfig = { delayMs: 5000 };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, PendingKind> = new Map();

function publish(): void {
  snapshot = new Map([...entries].map(([id, entry]) => [id, entry.kind]));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function settle(id: string): Promise<void> {
  const entry = entries.get(id);
  if (!entry) return Promise.resolve();
  if (entry.running) return entry.running;
  clearTimeout(entry.timer);
  entry.running = (async () => {
    try {
      await entry.commit();
    } finally {
      entries.delete(id);
      publish();
    }
  })();
  return entry.running;
}

/** Announces `kind` for a request now and carries it out after the undo delay. A second call replaces the first. */
export function schedule(id: string, kind: PendingKind, commit: () => Promise<void>): void {
  if (entries.get(id)?.running) return;
  undo(id);
  const timer = setTimeout(() => void settle(id), undoConfig.delayMs);
  entries.set(id, { kind, timer, commit, running: null });
  publish();
}

export function undo(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.running) return;
  clearTimeout(entry.timer);
  entries.delete(id);
  publish();
}

/** Carries out at once everything still waiting, and resolves once it is done. */
export function settlePending(): Promise<void> {
  return Promise.all([...entries.keys()].map((id) => settle(id))).then(() => undefined);
}

/** Carries out at once everything still waiting. Called when the page is being left. */
export function flushPending(): void {
  void settlePending();
}

/** Forgets everything still waiting without carrying it out. For tests. */
export function clearPending(): void {
  for (const entry of entries.values()) clearTimeout(entry.timer);
  entries.clear();
  publish();
}

/** The requests with an action waiting for its undo delay. */
export function usePendingActions(): ReadonlyMap<string, PendingKind> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushPending);
// Signing out leaves the page too: what waits is carried out while the session still exists.
registerBeforeSignOut(settlePending);

/** Discard a draft or withdraw a request, with an undo instead of a warning (U6). */
export function useUndoable(): { discard: (request: RequestOut) => void; withdraw: (request: RequestOut) => void } {
  const { t } = useRequestsText();
  const qc = useQueryClient();

  const start = useCallback(
    (request: RequestOut, kind: PendingKind) => {
      const id = request.public_id;
      schedule(id, kind, async () => {
        try {
          if (kind === "discard") await requestsApi.discard(id);
          else await requestsApi.withdraw(id);
        } catch (error) {
          toast(isConflict(error) ? t("undo.tooLate") : t("errors:unexpected"));
        } finally {
          await refreshRequests(qc);
        }
      });
      toast(t(`undo.${kind}`), { undo: () => undo(id) });
    },
    [qc, t],
  );

  const discard = useCallback((request: RequestOut) => start(request, "discard"), [start]);
  const withdraw = useCallback((request: RequestOut) => start(request, "withdraw"), [start]);
  return { discard, withdraw };
}
