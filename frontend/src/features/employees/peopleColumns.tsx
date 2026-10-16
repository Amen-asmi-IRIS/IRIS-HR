import type { ReactNode } from "react";
import { Link } from "react-router";

import { BalanceCell, TodayCell } from "@/features/home/PeopleCells";
import { WaitingCount } from "@/features/requests/WaitingCount";

import type { EmployeeRow } from "./api";

/** One attribute of a person in the list of My team. */
export interface PeopleColumn {
  id: string;
  /** A fully qualified translation key: "namespace:key". */
  headerKey: string;
  /** Columns are shown in ascending order. The name stays first: it is the link to the person. */
  order: number;
  cell: (row: EmployeeRow) => ReactNode;
}

/**
 * What My team, People shows per person (UI 6.3). Other features append their column at the end of
 * this file with `PEOPLE_COLUMNS.push({...})`. A list shows at most six attributes; `DataTable` enforces it.
 */
export const PEOPLE_COLUMNS: PeopleColumn[] = [
  {
    id: "name",
    headerKey: "employees:people.columns.name",
    order: 10,
    cell: (row) => (
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        to={`/team/people/${row.public_id}`}
      >
        {row.name}
      </Link>
    ),
  },
  {
    id: "position",
    headerKey: "employees:people.columns.position",
    order: 20,
    cell: (row) => row.position.title,
  },
];

PEOPLE_COLUMNS.push({
  id: "waiting",
  headerKey: "requests:people.waiting",
  order: 50,
  cell: (row) => <WaitingCount employeeId={row.public_id} name={row.name} />,
});

// What the person is doing today and their annual balance (plan 05). Neither is a filter nor an ordering of
// the list: a manager reads them here, the list is not searched or sorted by them.
PEOPLE_COLUMNS.push({
  id: "today",
  headerKey: "home:people.today",
  order: 30,
  cell: (row) => <TodayCell employeeId={row.public_id} />,
});

PEOPLE_COLUMNS.push({
  id: "balance",
  headerKey: "home:people.balance",
  order: 40,
  cell: (row) => <BalanceCell employeeId={row.public_id} />,
});
