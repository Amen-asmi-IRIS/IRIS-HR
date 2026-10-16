import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  DataTable, DateField, Disclosure, EmptyState, FileField, FilterBar, FilterDateRange, FilterSelect, FormSummary,
  PageHeader, Pager, SelectField, StatusBadge, SwitchField, TaskSheet, TextAreaField, TextField, TimeField, toast,
  useListParams,
} from "@/components";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateRange, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

interface Values {
  text: string;
  note: string;
  day: string;
  hour: string;
  choice: string;
  flag: boolean;
  file: File | null;
}

function Fields({ onValues }: { onValues: (values: Values) => void }) {
  const form = useForm<Values>({
    defaultValues: { text: "", note: "", day: "", hour: "", choice: "", flag: false, file: null },
  });
  return (
    <form onSubmit={form.handleSubmit(onValues)}>
      <TextField control={form.control} name="text" label="Texte" hint="Une aide" />
      <TextAreaField control={form.control} name="note" label="Note" optional />
      <DateField control={form.control} name="day" label="Jour" />
      <TimeField control={form.control} name="hour" label="Heure" />
      <SelectField
        control={form.control}
        name="choice"
        label="Choix"
        placeholder="Choisir"
        options={[
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ]}
      />
      <SwitchField control={form.control} name="flag" label="Drapeau" />
      <FileField control={form.control} name="file" label="Fichier" />
      <Button type="submit" variant="primary">
        Valider
      </Button>
    </form>
  );
}

function Params() {
  const params = useListParams({ status: "", from: "", to: "" });
  return (
    <>
      <output aria-label="valeur">{`${params.filters.status}|${params.page}|${JSON.stringify(params.query)}`}</output>
      <button onClick={() => params.setPage(3)}>page trois</button>
      <FilterBar more={<span>filtre de plus</span>}>
        <FilterSelect
          label="Situation"
          value={params.filters.status}
          onChange={(value) => params.setFilter("status", value)}
          options={[
            { value: "", label: "Toutes" },
            { value: "approved", label: "Approuvées" },
          ]}
        />
        <FilterDateRange
          label="Période"
          from={params.filters.from}
          to={params.filters.to}
          onFrom={(value) => params.setFilter("from", value)}
          onTo={(value) => params.setFilter("to", value)}
        />
      </FilterBar>
      <Link to="/me/requests/req-1">ailleurs</Link>
    </>
  );
}

function Sheet() {
  const [open, setOpen] = useState(true);
  return (
    <TaskSheet open={open} onOpenChange={setOpen} title="Une tâche" footer={<Button onClick={() => setOpen(false)}>Terminer</Button>}>
      <p>Contenu de la tâche</p>
    </TaskSheet>
  );
}

describe("the shared building blocks this feature is written against", () => {
  it("form inputs are found by their label and give plain values", async () => {
    const onValues = vi.fn();
    renderApp(<Fields onValues={onValues} />, { route: "/me", path: "/me", me });
    setText("Texte", "bonjour");
    setText("Note (facultatif)", "une note");
    setDate("Jour", "2026-11-09");
    setTime("Heure", "14:30");
    await chooseOption("Choix", "Option B");
    await toggle("Drapeau");
    const file = new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" });
    await pickFile("Fichier", file);
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onValues).toHaveBeenCalledTimes(1);
    expect(onValues.mock.calls[0][0]).toEqual({
      text: "bonjour",
      note: "une note",
      day: "2026-11-09",
      hour: "14:30",
      choice: "b",
      flag: true,
      file,
    });
  });

  it("a table opens a row from its first column, which is plain text", async () => {
    const onRowOpen = vi.fn();
    renderApp(
      <>
        <PageHeader title="Mes demandes" back="/me" primary={<Button variant="primary">Nouvelle demande</Button>} />
        <DataTable
          columns={[
            { key: "name", header: "Nom", cell: (row: { id: string; name: string }) => row.name },
            { key: "status", header: "Situation", cell: () => <StatusBadge tone="waiting">En attente de Sami</StatusBadge> },
          ]}
          rows={[{ id: "1", name: "Amal" }]}
          rowKey={(row) => row.id}
          onRowOpen={onRowOpen}
          empty={<EmptyState title="Rien ici" hint="Pourquoi" />}
          isLoading={false}
        />
        <Pager page={1} pageSize={25} total={60} onPage={() => undefined} />
        <FormSummary problems={["Un problème général"]} />
      </>,
      { route: "/me", path: "/me", me },
    );
    expect(screen.getByRole("heading", { name: "Mes demandes" })).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Un problème général");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Amal" }));
    expect(onRowOpen).toHaveBeenCalledWith({ id: "1", name: "Amal" });
  });

  it("an empty table shows why it is empty", () => {
    renderApp(
      <DataTable
        columns={[{ key: "name", header: "Nom", cell: (row: { id: string }) => row.id }]}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<EmptyState title="Rien ici" hint="Pourquoi" />}
      />,
      { route: "/me", path: "/me", me },
    );
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.getByText("Pourquoi")).toBeInTheDocument();
  });

  it("a disclosure mounts its content only once opened", async () => {
    renderApp(
      <Disclosure title="Historique">
        <p>Détail</p>
      </Disclosure>,
      { route: "/me", path: "/me", me },
    );
    expect(screen.queryByText("Détail")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Historique"));
    expect(screen.getByText("Détail")).toBeInTheDocument();
  });

  it("a task sheet is a dialog named by its title", async () => {
    renderApp(<Sheet />, { route: "/me", path: "/me", me });
    const dialog = screen.getByRole("dialog", { name: "Une tâche" });
    expect(within(dialog).getByText("Contenu de la tâche")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Terminer" }));
    expect(screen.queryByRole("dialog", { name: "Une tâche" })).not.toBeInTheDocument();
  });

  it("list parameters live in the address, and a new filter returns to the first page", async () => {
    renderApp(<Params />, { route: "/me/requests", path: "/me/requests", me });
    expect(screen.getByLabelText("valeur")).toHaveTextContent('|1|{"page":1}');
    await userEvent.click(screen.getByRole("button", { name: "page trois" }));
    expect(screen.getByLabelText("valeur")).toHaveTextContent("|3|");
    await chooseOption("Situation", "Approuvées");
    expect(screen.getByLabelText("valeur")).toHaveTextContent('approved|1|{"page":1,"status":"approved"}');
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    expect(screen.getByLabelText("valeur")).toHaveTextContent('"from":"2026-11-01","to":"2026-11-30"');
  });

  it("a page that navigates away leaves its address in sight", async () => {
    renderApp(<Params />, { route: "/me/requests", path: "/me/requests", me });
    await userEvent.click(screen.getByRole("link", { name: "ailleurs" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1");
  });

  it("formatters take a value and a language", () => {
    for (const lang of ["fr", "en"] as const) {
      expect(formatDate("2026-11-09", lang)).toMatch(/2026/);
      expect(formatDateRange("2026-11-09", "2026-11-11", lang)).toMatch(/11/);
      expect(formatDateTime("2026-11-09T14:30:00+01:00", lang)).toMatch(/14/);
      expect(formatDays("2.5", lang)).toMatch(/2[.,]5/);
      expect(formatHours("1.25", lang)).toMatch(/1[.,]25/);
    }
  });

  it("a toast acknowledges an action and can offer to take it back", async () => {
    const undo = vi.fn();
    renderApp(<p>page</p>, { route: "/me", path: "/me", me });
    act(() => toast("Brouillon supprimé.", { undo }));
    expect(await screen.findByText("Brouillon supprimé.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Annuler l'action" }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
