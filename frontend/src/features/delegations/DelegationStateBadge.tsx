import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { upcoming: "info", active: "approved", ended: "neutral", cancelled: "neutral" } as const;

export function DelegationStateBadge({ state }: { state: string }) {
  const { t } = useTranslation("delegations");
  const tone = TONES[state as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`state.${state}`)}</StatusBadge>;
}
