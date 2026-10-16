import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useBalance } from "./api";

/**
 * The current annual balance, for the line of facts shown first on an employee record. It asks for the same query
 * as the Balance block, so a record makes one balance request.
 */
export function BalanceFact({ employeeId }: { employeeId: string }) {
  const lang = useLang();
  const balance = useBalance(employeeId);

  return <>{balance.data ? formatDays(balance.data.current, lang) : "…"}</>;
}
