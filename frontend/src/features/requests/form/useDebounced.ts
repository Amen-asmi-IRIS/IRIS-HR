import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `delayMs`. Pass a primitive: an object is new on every render. */
export function useDebounced<T extends string | number | boolean>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
