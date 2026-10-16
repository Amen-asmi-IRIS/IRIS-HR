import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { DateRangeFields } from "./DateRangeFields";
import { FileField } from "./FileField";
import { FormSummary } from "./FormSummary";
import { SelectField } from "./SelectField";
import { SwitchField } from "./SwitchField";
import { TaskSheet } from "./TaskSheet";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { TimeField } from "./TimeField";
import { useProblemForm } from "./useProblemForm";

interface Values {
  email: string;
  note: string;
  kind: string;
  day: string;
  start: string;
  end: string;
  at: string;
  active: boolean;
  file: File | null;
}

const empty: Values = { email: "", note: "", kind: "", day: "", start: "", end: "", at: "", active: false, file: null };

function Harness({ send, mapField }: { send: (values: Values) => Promise<void>; mapField?: (field: string) => string | null }) {
  const form = useForm<Values>({ defaultValues: empty });
  const problems = useProblemForm(form, { mapField });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        problems.clear();
        try {
          await send(values);
        } catch (error) {
          problems.onError(error);
        }
      })}
    >
      <FormSummary problems={problems.summary} />
      <TextField control={form.control} name="email" label="Adresse" hint="Votre adresse professionnelle" />
      <TextAreaField control={form.control} name="note" label="Note" optional />
      <SelectField control={form.control} name="kind" label="Type" placeholder="Choisir" options={[{ value: "a", label: "Option A" }]} />
      <DateField control={form.control} name="day" label="Jour" />
      <DateRangeFields control={form.control} startName="start" endName="end" startLabel="Début" endLabel="Fin" />
      <TimeField control={form.control} name="at" label="Heure" />
      <SwitchField control={form.control} name="active" label="Actif" />
      <FileField control={form.control} name="file" label="Justificatif" />
      <Button type="submit" variant="primary">
        Envoyer
      </Button>
    </form>
  );
}

const refusal = (errors: ProblemError["errors"]) => new ProblemError({ status: 400, code: "validation", detail: "Refusé.", errors, requestId: "r1" });

describe("bound fields", () => {
  it("collect every kind of value", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<Harness send={send} />);
    const file = new File(["%PDF-1.7"], "certificat.pdf", { type: "application/pdf" });

    await user.type(screen.getByLabelText("Adresse"), "sami@impactrisks.com");
    await user.type(screen.getByLabelText(/^Note/), "Bonjour");
    await user.selectOptions(screen.getByLabelText("Type"), "a");
    await user.type(screen.getByLabelText("Jour"), "2026-11-03");
    await user.type(screen.getByLabelText("Début"), "2026-11-04");
    await user.type(screen.getByLabelText("Fin"), "2026-11-06");
    await user.type(screen.getByLabelText("Heure"), "09:30");
    await user.click(screen.getByRole("switch", { name: "Actif" }));
    await user.upload(screen.getByLabelText("Justificatif"), file);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(send).toHaveBeenCalledWith({
      email: "sami@impactrisks.com",
      note: "Bonjour",
      kind: "a",
      day: "2026-11-03",
      start: "2026-11-04",
      end: "2026-11-06",
      at: "09:30",
      active: true,
      file,
    });
    expect(screen.getByLabelText("Fin")).toHaveAttribute("min", "2026-11-04");
    expect(screen.getByLabelText("Heure")).toHaveAttribute("step", "900");
  });

  it("mark an optional field and let a chosen file be removed", async () => {
    const user = userEvent.setup();
    render(<Harness send={vi.fn()} />);
    expect(screen.getByLabelText("Note (facultatif)")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Justificatif"), new File(["x"], "preuve.png", { type: "image/png" }));
    expect(screen.getByText("preuve.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer le fichier" }));
    expect(screen.queryByText("preuve.png")).not.toBeInTheDocument();
  });
});

describe("useProblemForm", () => {
  it("puts a server error next to its field, keeps what was typed and moves there", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }]));
    render(<Harness send={send} />);
    await user.type(screen.getByLabelText("Adresse"), "sami@impactrisks.com");
    await user.type(screen.getByLabelText(/^Note/), "Bonjour");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    const input = await screen.findByRole("textbox", { name: "Adresse", description: /Cette adresse est déjà utilisée\./ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("sami@impactrisks.com");
    expect(input).toHaveFocus();
    expect(screen.getByLabelText(/^Note/)).toHaveValue("Bonjour");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists problems that belong to no field above the form", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(
      refusal([
        { field: null, code: "auth.invalid_credentials", detail: "Adresse ou mot de passe incorrect.", params: {} },
        { field: "unknown_field", code: "x", detail: "Autre problème.", params: {} },
      ]),
    );
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Adresse ou mot de passe incorrect.");
    expect(alert).toHaveTextContent("Autre problème.");
  });

  it("puts a problem about one entry of a list on the input of the list", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "email.0", code: "validation.invalid_choice", detail: "Valeur refusée.", params: {} }]));
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("textbox", { name: "Adresse", description: /Valeur refusée\./ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can send a server field to another input", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "value", code: "settings.out_of_range", detail: "Valeur hors limites.", params: {} }]));
    render(<Harness send={send} mapField={(field) => (field === "value" ? "email" : field)} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("textbox", { name: "Adresse", description: /Valeur hors limites\./ })).toBeInTheDocument();
  });

  it("says something readable when the failure is not a problem, and clears it on the next try", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Une erreur est survenue. Veuillez réessayer.");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return (
    <TaskSheet open={open} onOpenChange={setOpen} title="Rôles" description="Ajoutez ou retirez un rôle." footer={<Button variant="primary">Terminé</Button>}>
      <p>Contenu de la tâche</p>
    </TaskSheet>
  );
}

describe("TaskSheet", () => {
  it("holds a focused task with its title, body and footer, and closes", async () => {
    render(<SheetHarness />);
    const dialog = screen.getByRole("dialog", { name: "Rôles" });
    expect(dialog).toHaveAccessibleDescription("Ajoutez ou retirez un rôle.");
    expect(within(dialog).getByText("Contenu de la tâche")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Terminé" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

function OpenedByAButton({ kind }: { kind: "sheet" | "confirm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Ouvrir</Button>
      {kind === "sheet" ? (
        <TaskSheet open={open} onOpenChange={setOpen} title="Rôles">
          <p>Contenu de la tâche</p>
        </TaskSheet>
      ) : (
        <ConfirmDialog open={open} onOpenChange={setOpen} title="Retirer ?" consequence="La demande est retirée." confirmLabel="Retirer" onConfirm={() => undefined} />
      )}
    </>
  );
}

describe("focus after a sheet or a confirmation that a button opened", () => {
  it.each([
    ["a sheet closed with Escape", "sheet", "Escape"],
    ["a sheet closed with its close button", "sheet", "Fermer"],
    ["a confirmation closed with Escape", "confirm", "Escape"],
    ["a confirmation closed with Cancel", "confirm", "Annuler"],
  ] as const)("goes back to the button: %s", async (_case, kind, close) => {
    const user = userEvent.setup();
    render(<OpenedByAButton kind={kind} />);
    const opener = screen.getByRole("button", { name: "Ouvrir" });
    await user.click(opener);
    await screen.findByRole(kind === "sheet" ? "dialog" : "alertdialog");

    if (close === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: close }));

    expect(screen.queryByRole(kind === "sheet" ? "dialog" : "alertdialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

function OpenerRemovedOnClose() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <main id="main" tabIndex={-1}>
      {!done && <Button onClick={() => setOpen(true)}>Approuver</Button>}
      <TaskSheet
        open={open}
        onOpenChange={setOpen}
        title="Approuver la demande"
        footer={
          <Button
            onClick={() => {
              setDone(true);
              setOpen(false);
            }}
          >
            Confirmer
          </Button>
        }
      >
        <p>Contenu de la tâche</p>
      </TaskSheet>
    </main>
  );
}

describe("focus after a sheet whose button is gone", () => {
  it("goes to the page content, not to nowhere", async () => {
    const user = userEvent.setup();
    render(<OpenerRemovedOnClose />);
    await user.click(screen.getByRole("button", { name: "Approuver" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("goes to the page content when no button opened it (a sheet the address opens)", async () => {
    function OpenedByTheAddress() {
      const [open, setOpen] = useState(true);
      return (
        <main id="main" tabIndex={-1}>
          <TaskSheet open={open} onOpenChange={setOpen} title="Approuver la demande" footer={null}>
            <p>Contenu de la tâche</p>
          </TaskSheet>
        </main>
      );
    }
    const user = userEvent.setup();
    render(<OpenedByTheAddress />);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("ConfirmDialog", () => {
  it("states the consequence and acts only on confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Désactiver</Button>}
        title="Désactiver ce compte ?"
        consequence="La personne est déconnectée immédiatement et ne peut plus se connecter."
        confirmLabel="Désactiver le compte"
        destructive
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Désactiver ce compte ?" });
    expect(dialog).toHaveAccessibleDescription("La personne est déconnectée immédiatement et ne peut plus se connecter.");

    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    await user.click(await screen.findByRole("button", { name: "Désactiver le compte" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
