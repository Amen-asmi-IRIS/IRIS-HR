import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { setPhoneViewport } from "@/test/viewport";
import { DataTable, type Column } from "./DataTable";
import { FilterBar } from "./FilterBar";
import { FilterDateRange, FilterSelect, FilterText } from "./filters";
import { Pager } from "./Pager";
import { backToList, useListParams } from "./useListParams";

interface Row {
  id: string;
  name: string;
  email: string;
}

const rows: Row[] = [
  { id: "1", name: "Sami Ben Ali", email: "sami@impactrisks.com" },
  { id: "2", name: "Leila Trabelsi", email: "leila@impactrisks.com" },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Nom", cell: (row) => row.name },
  { key: "email", header: "Adresse", cell: (row) => row.email },
];

describe("DataTable", () => {
  it("shows a table whose first column opens the row", async () => {
    const onRowOpen = vi.fn();
    render(<DataTable label="Comptes" columns={columns} rows={rows} rowKey={(row) => row.id} onRowOpen={onRowOpen} empty={<p>Vide</p>} />);
    const table = screen.getByRole("table", { name: "Comptes" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Nom", "Adresse"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    await userEvent.click(within(table).getByRole("button", { name: "Leila Trabelsi" }));
    expect(onRowOpen).toHaveBeenCalledWith(rows[1]);
  });

  it("becomes a list of cards on a phone", () => {
    setPhoneViewport(true);
    render(<DataTable label="Comptes" columns={columns} rows={rows} rowKey={(row) => row.id} empty={<p>Vide</p>} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Comptes" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Adresse")).toBeInTheDocument();
    expect(within(items[0]).getByText("sami@impactrisks.com")).toBeInTheDocument();
  });

  it("explains an empty list and shows when it is loading", () => {
    const { rerender } = render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} empty={<p>Aucun compte</p>} />);
    expect(screen.getByText("Aucun compte")).toBeInTheDocument();
    rerender(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} empty={<p>Aucun compte</p>} isLoading />);
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Aucun compte")).not.toBeInTheDocument();
  });

  it("refuses a seventh attribute", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seven = Array.from({ length: 7 }, (_, index) => ({ key: `c${index}`, header: `C${index}`, cell: (row: Row) => row.name }));
    expect(() => render(<DataTable columns={seven} rows={rows} rowKey={(row) => row.id} empty={null} />)).toThrow(/at most six/);
  });
});

describe("Pager", () => {
  it("shows nothing when everything fits on one page", () => {
    const { container } = render(<Pager page={1} pageSize={25} total={25} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("moves between pages without ever showing a disabled button", async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pager page={1} pageSize={25} total={80} onPage={onPage} />);
    expect(screen.getByText("Page 1 sur 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page précédente" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(onPage).toHaveBeenCalledWith(2);

    rerender(<Pager page={4} pageSize={25} total={80} onPage={onPage} />);
    expect(screen.queryByRole("button", { name: "Page suivante" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Page précédente" }));
    expect(onPage).toHaveBeenCalledWith(3);
  });
});

describe("FilterBar", () => {
  it("keeps extra filters one step away", async () => {
    const user = userEvent.setup();
    render(
      <FilterBar more={<FilterText label="Adresse réseau" value="" onChange={() => {}} />}>
        <FilterText label="Recherche" value="" onChange={() => {}} />
        <FilterSelect label="État" value="" onChange={() => {}} options={[{ value: "", label: "Tous" }, { value: "locked", label: "Verrouillé" }]} />
        <FilterDateRange label="Période" from="" to="" onFrom={() => {}} onTo={() => {}} />
      </FilterBar>,
    );
    expect(screen.getByRole("search", { name: "Filtres" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Recherche" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "État" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Période" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse réseau")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));
    expect(screen.getByLabelText("Adresse réseau")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Moins de filtres" })).toHaveAttribute("aria-expanded", "true");
  });

  it("refuses a fourth visible filter", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = (label: string) => <FilterText key={label} label={label} value="" onChange={() => {}} />;
    expect(() => render(<FilterBar>{[filter("A"), filter("B"), filter("C"), filter("D")]}</FilterBar>)).toThrow(/At most three/);
  });
});

function ListProbe() {
  const list = useListParams({ search: "", state: "active" });
  const location = useLocation();
  return (
    <div>
      <p data-testid="url">{location.pathname + location.search}</p>
      <p data-testid="query">{JSON.stringify(list.query)}</p>
      <button onClick={() => list.setFilter("search", "sami")}>search</button>
      <button onClick={() => list.setFilter("state", "locked")}>locked</button>
      <button onClick={() => list.setFilter("state", "active")}>active</button>
      <button onClick={() => list.setPage(3)}>page 3</button>
      <button onClick={() => list.setSort("-last_login_at")}>sort</button>
    </div>
  );
}

describe("useListParams", () => {
  it("keeps filters, sort and page in the address", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin/accounts?page=2"]}>
        <ListProbe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("query")).toHaveTextContent('{"page":2,"state":"active"}');

    await user.click(screen.getByRole("button", { name: "search" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami");
    expect(screen.getByTestId("query")).toHaveTextContent('{"page":1,"search":"sami","state":"active"}');

    await user.click(screen.getByRole("button", { name: "locked" }));
    await user.click(screen.getByRole("button", { name: "page 3" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami&state=locked&page=3");

    await user.click(screen.getByRole("button", { name: "active" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami");

    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByTestId("query")).toHaveTextContent('"ordering":"-last_login_at"');
  });

  it("remembers the filters of a list for the way back", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/accounts?state=locked"]}>
        <ListProbe />
      </MemoryRouter>,
    );
    expect(backToList("/admin/accounts")).toBe("/admin/accounts?state=locked");
    expect(backToList("/admin/elsewhere")).toBe("/admin/elsewhere");
  });
});

describe("DataTable, sorting", () => {
  interface Person { id: string; name: string; email: string }
  const people: Person[] = [
    { id: "1", name: "Amal Employee", email: "employee.a1@impactrisks.com" },
    { id: "2", name: "Bilel Employee", email: "employee.a2@impactrisks.com" },
  ];
  const sortableColumns = [
    { key: "name", header: "Nom", cell: (row: Person) => row.name, sortBy: "name" },
    { key: "email", header: "Adresse", cell: (row: Person) => row.email, sortBy: "email" },
    { key: "state", header: "État", cell: () => "Actif" },
  ];
  const table = (sort: string, onSort: (next: string) => void) => (
    <DataTable label="Comptes" columns={sortableColumns} rows={people} rowKey={(row) => row.id} empty={<p>Vide</p>} sort={sort} onSort={onSort} />
  );

  it("offers a sort on the columns that have one, and says which way the list is sorted", async () => {
    const onSort = vi.fn();
    const { rerender } = render(table("", onSort));
    const headers = within(screen.getByRole("table", { name: "Comptes" })).getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual(["Nom", "Adresse", "État"]);      // the texts do not change
    expect(headers.map((cell) => cell.getAttribute("aria-sort"))).toEqual(["none", "none", null]);
    expect(within(headers[2]).queryByRole("button")).not.toBeInTheDocument();                // no sort, no button (M8)

    await userEvent.click(within(headers[0]).getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("name");

    rerender(table("name", onSort));
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("-name");

    rerender(table("-name", onSort));
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(screen.getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("name");
  });

  it("is a plain table when no sort handler is given", () => {
    render(<DataTable label="Comptes" columns={sortableColumns} rows={people} rowKey={(row) => row.id} empty={<p>Vide</p>} />);
    expect(screen.queryByRole("button", { name: "Nom" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[0]).not.toHaveAttribute("aria-sort");
  });

  it("offers the same sorts as one choice on a phone", async () => {
    setPhoneViewport(true);
    const onSort = vi.fn();
    render(table("-email", onSort));
    const choice = screen.getByRole("combobox", { name: "Trier par" });
    expect(choice).toHaveValue("-email");
    expect(within(choice).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Ordre habituel", "Nom, croissant", "Nom, décroissant", "Adresse, croissant", "Adresse, décroissant",
    ]);
    await userEvent.selectOptions(choice, "name");
    expect(onSort).toHaveBeenCalledWith("name");
    setPhoneViewport(false);
  });
});
