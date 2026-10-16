import { Link } from "react-router";
import { useRequestList } from "./api";
import { useRequestsText } from "./platform";

interface WaitingCountProps {
  employeeId: string;
  /** The person's name, for the accessible name of the link. */
  name: string;
}

/** How many requests of one person are waiting, for the People list of My team (UI 6.3). */
export function WaitingCount({ employeeId, name }: WaitingCountProps) {
  const { t } = useRequestsText();
  // One row is asked for: only the count is read.
  const waiting = useRequestList({ scope: "team", employee: employeeId, status: "pending", page_size: 1 });
  if (!waiting.isSuccess) return null;
  const count = waiting.data.count;
  if (count === 0) return <span className="text-muted-foreground">{t("people.none")}</span>;
  return (
    <Link
      to={`/team/requests?employee=${encodeURIComponent(employeeId)}&status=pending`}
      aria-label={t("people.waitingFor", { name, n: count })}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {count}
    </Link>
  );
}
