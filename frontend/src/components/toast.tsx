import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

const STAY_MS = 5000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismiss(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Acknowledges an action. With `undo`, offers to take it back for five seconds. */
export function toast(message: string, options: { undo?: () => void } = {}): void {
  const id = nextId++;
  items = [...items, { id, message, undo: options.undo }];
  emit();
  setTimeout(() => dismiss(id), STAY_MS);
}

export function clearToasts(): void {
  items = [];
  emit();
}

export function Toaster() {
  const { t } = useTranslation();
  const current = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {current.map((item) => (
        <div key={item.id} className="pointer-events-auto flex items-center gap-4 rounded-lg bg-[var(--toast)] px-4 py-3 text-body text-background shadow-popover animate-fade-in">
          <span>{item.message}</span>
          {item.undo && (
            <button
              type="button"
              className="cursor-pointer font-semibold underline underline-offset-4"
              onClick={() => {
                item.undo?.();
                dismiss(item.id);
              }}
            >
              {t("actions.undo")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
