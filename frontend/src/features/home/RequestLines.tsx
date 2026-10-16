import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useRequestsText } from "@/features/requests/platform";
import { StatusSentence } from "@/features/requests/StatusSentence";
import { describeWhen } from "@/features/requests/text";
import type { RequestOut } from "@/features/requests/types";
import { useLang } from "@/i18n";
import { formatDays, formatHours } from "@/lib/format";

interface RequestLinesProps {
  requests: RequestOut[];
  show: "status" | "quantity";
}

/** A short list of the user's own requests: what, when, and either where it stands or how long it is. */
export function RequestLines({ requests, show }: RequestLinesProps) {
  const { t } = useTranslation("home");
  const lang = useLang();
  const requestsText = useRequestsText();
  return (
    <ul className="divide-y divide-divider">
      {requests.map((request) => (
        <li key={request.public_id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <Link to={`/requests/${request.public_id}`} className="text-body text-foreground hover:underline">
            {/* The half of a half-day, or the hours of a permission, as the request pages say them. */}
            {t("lines.what", { type: request.type.name, dates: describeWhen(request, requestsText.t, lang) })}
          </Link>
          {show === "status" ? (
            <StatusSentence request={request} />
          ) : (
            <span className="text-body tabular-nums text-text-secondary">
              {request.type.unit === "hour" ? formatHours(request.quantity, lang) : formatDays(request.quantity, lang)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
