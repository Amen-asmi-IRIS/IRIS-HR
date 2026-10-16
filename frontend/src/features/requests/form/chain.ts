import type { Translate } from "../platform";
import type { ChainStepPreview } from "../types";

/** "Your manager, Sami Ben Ali, then HR". The names come from the server; nothing is resolved here (U4). */
export function chainSentence(chain: ChainStepPreview[], t: Translate, mode: "me" | "hr"): string {
  if (chain.length === 0) return capitalise(t("chain.nobody"));
  const parts = chain.map((step) => {
    const names = step.approvers.join(", ");
    let who: string;
    if (step.rule === "hr_role") who = t("common.hr");
    else if (step.rule === "line_manager") {
      who = names ? t(mode === "me" ? "chain.yourManager" : "chain.theManager", { names }) : t("chain.noManager");
    } else who = names || t("chain.nobody");
    return step.mode === "notify" ? t("chain.informed", { who }) : who;
  });
  return capitalise(parts.join(t("chain.then")));
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
