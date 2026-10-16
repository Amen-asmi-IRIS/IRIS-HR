import { useCallback, useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { EMPTY, type FormValues } from "./schema";

const PREFIX = "iris-hr:request-form:";

type Kept = Omit<FormValues, "file">;

export function keeperKey(viewerId: string, formId: string): string {
  return `${PREFIX}${viewerId}:${formId}`;
}

function read(key: string): Kept | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Kept) : null;
  } catch {
    return null;
  }
}

function write(key: string, values: FormValues): void {
  try {
    // `file: undefined` is dropped by JSON.stringify: a file is never stored.
    window.sessionStorage.setItem(key, JSON.stringify({ ...values, file: undefined }));
  } catch {
    // Storage is unavailable (private window, quota): nothing is kept, and the form still works.
  }
}

function remove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

/** Removes what another person left in this tab, so one account never sees another's unsent text. */
export function purgeOthers(viewerId: string): void {
  try {
    const mine = `${PREFIX}${viewerId}:`;
    const doomed: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(PREFIX) && !key.startsWith(mine)) doomed.push(key);
    }
    doomed.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage is unavailable.
  }
}

/**
 * Signing out leaves no unsent text behind for the next person on this browser. A session that ends by itself
 * keeps it: that is what the keeper is for (UI 3.4).
 */
export function forgetRequestForms(): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage is unavailable: nothing was kept either.
  }
}

/**
 * Keeps the unsent values of a form in the tab's session storage, so that a session that ends
 * while the form is open (the client then goes to Sign in and back) does not cost what was typed.
 * Storage lasts as long as the tab, like the session cookie. Give the form a React `key` equal to
 * `formId` so that a different form starts from its own kept values.
 */
export function useDraftKeeper(
  viewerId: string,
  formId: string,
  form: UseFormReturn<FormValues>,
): { restored: boolean; clear: () => void } {
  const key = keeperKey(viewerId, formId);
  const [restored, setRestored] = useState(() => read(key) !== null);

  useEffect(() => {
    purgeOthers(viewerId);
    const kept = read(key);
    if (kept) form.reset({ ...EMPTY, ...kept, file: null }, { keepDefaultValues: true });
  }, [key, viewerId, form]);

  useEffect(() => {
    const subscription = form.watch((values) => write(key, { ...EMPTY, ...values } as FormValues));
    return () => subscription.unsubscribe();
  }, [key, form]);

  const clear = useCallback(() => {
    remove(key);
    setRestored(false);
  }, [key]);

  return { restored, clear };
}
