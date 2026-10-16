import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";

const TONES: Record<string, StatusTone> = {
  active: "approved",
  awaiting_first_sign_in: "waiting",
  locked: "refused",
  disabled: "neutral",
};

/** The state of an account as a sentence, never as a code. */
export function AccountState({ state }: { state: string }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TONES[state] ?? "neutral"}>{t(`accounts:states.${state}`)}</StatusBadge>;
}
