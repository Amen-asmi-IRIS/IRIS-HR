import { StatusBadge } from "@/components";
import { formatDateTime } from "@/lib/format";
import { useRequestsText } from "./platform";
import type { Tone } from "./status";
import type { CertificateStatus, RequestOut } from "./types";

const TONES: Record<CertificateStatus, Tone> = {
  not_needed: "neutral",
  attached: "approved",
  due: "waiting",
  overdue: "refused",
  missing: "waiting",
};

/**
 * Where the document of a request stands (UI 7.2): not needed, provided, due by, overdue.
 * Renders nothing when the API does not tell this viewer (`certificate` is null).
 */
export function DocumentStatus({ request }: { request: Pick<RequestOut, "certificate"> }) {
  const { t, lang } = useRequestsText();
  const certificate = request.certificate;
  if (!certificate) return null;
  const date = certificate.due_at ? formatDateTime(certificate.due_at, lang) : "";
  return <StatusBadge tone={TONES[certificate.status]}>{t(`document.${certificate.status}`, { date })}</StatusBadge>;
}
