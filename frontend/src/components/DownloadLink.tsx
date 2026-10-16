import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { download } from "@/api/client";
import { ProblemError } from "@/api/problem";
import { problemText } from "@/api/problemText";
import { toast } from "./toast";

/**
 * A link to a file the API serves: an attachment, an export. Use it wherever a page would write
 * `<a href="/api/v1/…">`. It stays a real link with its address, but an ordinary click fetches the file
 * through the API client: a session that ended leads to Sign in and back to the page (UI 3.4), and a refusal
 * is said in words. Following the address itself would put the raw answer of the API in front of the reader.
 */
export function DownloadLink({ href, onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { t } = useTranslation();

  function follow(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    // A click meant for a new tab or window is the browser's.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    download(href).catch((error: unknown) => {
      // The page is already on its way to Sign in.
      if (error instanceof ProblemError && error.status === 401) return;
      toast(problemText(error, t));
    });
  }

  return (
    <a href={href} onClick={follow} {...props}>
      {children}
    </a>
  );
}
