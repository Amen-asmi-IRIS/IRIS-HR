import { StatusBadge } from "@/components";
import { useRequestsText } from "./platform";
import { allSentences, headline } from "./status";
import type { RequestOut } from "./types";

interface StatusSentenceProps {
  request: RequestOut;
  /** On a detail page, show every sentence; in a list, only the one that matters most. */
  detail?: boolean;
  /** On a detail page that states the document itself (HR view), leave the certificate out. */
  withoutCertificate?: boolean;
}

export function StatusSentence({ request, detail = false, withoutCertificate = false }: StatusSentenceProps) {
  const { t, lang } = useRequestsText();
  const sentences = detail ? allSentences(request, t, lang, !withoutCertificate) : [headline(request, t, lang)];
  return (
    <div className="flex flex-col items-start gap-1">
      {sentences.map((sentence) => (
        <StatusBadge key={sentence.text} tone={sentence.tone}>
          {sentence.text}
        </StatusBadge>
      ))}
    </div>
  );
}
