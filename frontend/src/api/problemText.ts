import type { TFunction } from "i18next";
import { ProblemError } from "./problem";

/** The sentence to show for any error: the server's own text when it sent one. */
export function problemText(error: unknown, t: TFunction): string {
  if (error instanceof ProblemError) {
    if (error.detail) return error.detail;
    if (error.status === 0) return t("errors:network");
    // The proxy refuses a body larger than any upload before the API can say so in its own words.
    if (error.status === 413) return t("errors:tooLarge");
    if (error.unavailable) return t("errors:unavailable");
  }
  return t("errors:unexpected");
}
