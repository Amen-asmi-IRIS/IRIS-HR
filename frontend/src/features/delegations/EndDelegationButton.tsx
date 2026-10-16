import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { ConfirmDialog, toast } from "@/components";
import { Button } from "@/components/ui/button";

import { type Delegation, useEndDelegation } from "./api";

/** Ends a running delegation or cancels an upcoming one, after stating the consequence. Renders nothing when the viewer may not end it. */
export function EndDelegationButton({ delegation }: { delegation: Delegation }) {
  const { t } = useTranslation("delegations");
  const [confirming, setConfirming] = useState(false);
  const end = useEndDelegation();
  if (!delegation.can_end) {
    return null;
  }
  const kind = delegation.state === "active" ? "active" : "upcoming";

  // The promise, not the callbacks of `mutate`: the refreshed list can remove this button before the
  // answer is handled, and callbacks given to `mutate` are dropped once their component is gone.
  const confirm = async () => {
    try {
      await end.mutateAsync(delegation.public_id);
      toast(t("end.done"));
    } catch (error) {
      toast(error instanceof ProblemError ? error.detail : t("end.failed"));
    }
    setConfirming(false);
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setConfirming(true)}>
        {t(`end.${kind}`)}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`end.title.${kind}`)}
        consequence={t(`end.consequence.${kind}`, { name: delegation.delegate.name })}
        confirmLabel={t(`end.confirm.${kind}`)}
        onConfirm={() => void confirm()}
        destructive
      />
    </>
  );
}
