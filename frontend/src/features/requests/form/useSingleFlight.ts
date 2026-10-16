import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps an action so that calls made while it is running are ignored: a double click sends once.
 * Returns the guarded action and whether it is running. The control stays enabled (M8); it only
 * shows that it is busy.
 */
export function useSingleFlight<A extends unknown[]>(
  run: (...args: A) => Promise<void>,
): [(...args: A) => Promise<void>, boolean] {
  const busy = useRef(false);
  const latest = useRef(run);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    latest.current = run;
  });

  const guarded = useCallback(async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await latest.current(...args);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return [guarded, pending];
}
