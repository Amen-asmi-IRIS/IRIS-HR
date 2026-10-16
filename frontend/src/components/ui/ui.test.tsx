import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "./alert-dialog";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";
import { Switch } from "./switch";

describe("Button", () => {
  it("is secondary and does not submit unless told otherwise", () => {
    render(<Button>Ouvrir</Button>);
    const button = screen.getByRole("button", { name: "Ouvrir" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-secondary");
    expect(button).not.toHaveClass("bg-primary");
  });

  it("marks the primary action with the IRIS blue", () => {
    render(
      <Button variant="primary" type="submit">
        Envoyer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-primary", "text-primary-foreground");
  });

  it("is 44px high on a phone and 40px on a desktop", () => {
    render(<Button>Ouvrir</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-11", "md:h-10");
  });

  it("can dress a link as a button", () => {
    render(
      <Button asChild variant="primary">
        <a href="/admin/accounts/new">Créer un compte</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Créer un compte" });
    expect(link).toHaveClass("bg-primary");
    expect(link).not.toHaveAttribute("type");
  });
});

describe("form primitives", () => {
  it("pass their attributes through", () => {
    render(
      <>
        <Input aria-label="Nom" aria-invalid defaultValue="Sami" />
        <NativeSelect aria-label="État" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>
        <Switch aria-label="Actif" defaultChecked />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("combobox", { name: "État" })).toHaveValue("b");
    expect(screen.getByRole("switch", { name: "Actif" })).toBeChecked();
  });
});

describe("Sheet", () => {
  it("is a dialog named by its title, with a labelled close button", () => {
    render(
      <Sheet open>
        <SheetContent closeLabel="Fermer" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Nommer un délégué</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Nommer un délégué" });
    expect(dialog).toHaveClass("md:w-[480px]", "w-full");
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });
});

describe("AlertDialog", () => {
  it("asks before acting and runs the action once", async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Désactiver le compte ?</AlertDialogTitle>
          <AlertDialogDescription>La personne est déconnectée immédiatement.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole("alertdialog", { name: "Désactiver le compte ?" })).toHaveAccessibleDescription("La personne est déconnectée immédiatement.");
    await userEvent.click(screen.getByRole("button", { name: "Désactiver" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("DropdownMenu and Popover", () => {
  it("open from the keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onSelect}>Se déconnecter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger asChild>
            <Button>Notifications</Button>
          </PopoverTrigger>
          <PopoverContent aria-label="Dernières notifications">Rien de nouveau</PopoverContent>
        </Popover>
      </>,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("dialog", { name: "Dernières notifications" })).toHaveTextContent("Rien de nouveau");
  });
});
