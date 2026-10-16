import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Disclosure } from "./Disclosure";
import { EmptyState } from "./EmptyState";
import { Figure } from "./Figure";
import { PageHeader } from "./PageHeader";
import { PageLoading } from "./PageLoading";
import { StatusBadge } from "./StatusBadge";
import { toast, Toaster } from "./toast";

describe("PageHeader", () => {
  it("shows the title as the page heading and in the tab", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Comptes" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Comptes" })).toBeInTheDocument();
    expect(document.title).toBe("Comptes · IRIS HR");
  });

  it("shows the primary action, a way back and a line under the title", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Sami Ben Ali" back="/admin/accounts" primary={<Button variant="primary">Réinitialiser le mot de passe</Button>}>
          <p>sami.benali@impactrisks.com</p>
        </PageHeader>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
    expect(screen.getByRole("button", { name: "Réinitialiser le mot de passe" })).toBeInTheDocument();
    expect(screen.getByText("sami.benali@impactrisks.com")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("says why the list is empty and offers the action that fills it", () => {
    render(<EmptyState title="Aucun compte" hint="Créez le premier compte." action={<Button>Créer un compte</Button>} />);
    expect(screen.getByText("Aucun compte")).toBeInTheDocument();
    expect(screen.getByText("Créez le premier compte.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer un compte" })).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("shows a sentence with a dot in the tone's colours", () => {
    render(<StatusBadge tone="waiting">En attente de première connexion</StatusBadge>);
    const badge = screen.getByText("En attente de première connexion");
    expect(badge).toHaveClass("bg-waiting-bg", "text-waiting");
    expect(badge.querySelector("[aria-hidden='true']")).toHaveClass("bg-waiting-dot");
  });
});

describe("Disclosure", () => {
  it("is closed until asked for, and mounts its content only then", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Historique">
        <p>Compte créé</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Historique" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Compte créé")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Compte créé")).toBeVisible();
  });
});

describe("Figure and PageLoading", () => {
  it("show the one number of a page with its label", () => {
    render(<Figure label="Solde" value="12,5" hint="jours" />);
    expect(screen.getByText("Solde")).toBeInTheDocument();
    expect(screen.getByText("12,5")).toHaveAttribute("data-figure");
    expect(screen.getByText("jours")).toBeInTheDocument();
  });

  it("say that the page is loading", () => {
    render(<PageLoading />);
    expect(screen.getByText("Chargement…")).toHaveAttribute("aria-busy", "true");
  });
});

describe("toast", () => {
  afterEach(() => vi.useRealTimers());

  it("acknowledges an action and leaves after five seconds", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => toast("Enregistré."));
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré.");
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré.");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("offers to undo where that is possible", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => toast("Brouillon supprimé.", { undo }));
    await userEvent.click(screen.getByRole("button", { name: "Annuler l'action" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
