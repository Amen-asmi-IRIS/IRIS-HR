import { DelegationSheet } from "@/features/delegations/DelegationSheet";
import { isFullRecord, useEmployee } from "@/features/employees/api";

interface ManagerDelegateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The requester whose request is stuck: the delegate is named for their manager. */
  employeeId: string;
}

/**
 * UI 7.4: name a delegate for the manager a request is stuck with. A queue item carries the
 * manager's name only, so the manager is read from the requester's record, which HR may open.
 */
export function ManagerDelegateSheet({ open, onOpenChange, employeeId }: ManagerDelegateSheetProps) {
  const requester = useEmployee(open ? employeeId : undefined);
  const manager = requester.data && isFullRecord(requester.data) ? requester.data.manager : null;
  if (!open || !manager) return null;
  return <DelegationSheet open onOpenChange={onOpenChange} manager={manager} />;
}
