import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { pending: "waiting", accepted: "approved", rejected: "refused", withdrawn: "neutral" } as const;

/** Where a proposal stands, as a sentence with a coloured dot. */
export function OutcomeBadge({ status }: { status: string }) {
  const { t } = useTranslation("profile");
  const tone = TONES[status as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`outcome.${status}`)}</StatusBadge>;
}
