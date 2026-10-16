import { useRef } from "react";

type AutoFocusHandler = (event: Event) => void;

/**
 * Gives the focus back, when a dialog closes, to what had it when the dialog opened (WCAG 2.4.3).
 * Radix returns it only to its own `Trigger`; most sheets and confirmations here are opened by an
 * ordinary button that sets `open`, and the focus then fell to the page itself. When that button is
 * gone (the row it was on was decided), or when nothing had the focus (a sheet the address opened), the
 * focus goes to the page content, `#main` of the shell.
 */
export function useReturnFocus(onOpenAutoFocus?: AutoFocusHandler, onCloseAutoFocus?: AutoFocusHandler) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      const active = (event.target as Node | null)?.ownerDocument?.activeElement;
      opener.current = active instanceof HTMLElement && active !== active.ownerDocument.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      const opened = opener.current;
      opener.current = null;
      if (event.defaultPrevented) return;
      const target = opened?.isConnected ? opened : document.getElementById("main");
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
  };
}
