import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeEmployee, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import ProposeChangePage from "./ProposeChangePage";
import { makeProfileChange } from "./testing";

const employee = makeMe({ roles: ["employee"], name: "Amal Employee" });

function mount() {
  return renderApp(
    <ProblemBoundary>
      <ProposeChangePage />
    </ProblemBoundary>,
    { route: "/me/profile/change", path: "/me/profile/change", me: employee },
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** The form is filled from the record once it has been read. */
async function loaded() {
  await waitFor(() => expect(screen.getByLabelText("Prénom")).toHaveValue("Amal"));
}

async function send() {
  await userEvent.click(screen.getByRole("button", { name: "Envoyer aux RH" }));
}

describe("ProposeChangePage", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/employees/me", () => HttpResponse.json(makeEmployee())));
  });

  it("starts from my current values, offers personal fields only and states the rule", async () => {
    mount();
    await loaded();

    expect(screen.getByRole("heading", { level: 1, name: "Proposer une modification" })).toBeInTheDocument();
    expect(screen.getByText("La modification s'applique une fois acceptée par les RH.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Employee");
    expect(screen.getByLabelText("Date de naissance")).toHaveValue("1992-04-11");
    expect(screen.getByLabelText("Genre")).toHaveValue("female");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("20 123 456");
    for (const contractual of ["Matricule", "E-mail professionnel", "Département", "Poste", "Type de contrat"]) {
      expect(screen.queryByLabelText(contractual)).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/me/profile");
  });

  it("sends only what changed, then returns to the profile", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/profile-changes", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange(), { status: 201 });
      }),
    );
    mount();
    await loaded();

    fill("Adresse", "12 rue de Carthage, Tunis");
    fill("Date de naissance", "");
    fill("Message pour les RH (facultatif)", "Nouveau logement");
    await send();

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/me/profile");
    expect(body).toEqual({
      changes: { date_of_birth: null, address: "12 rue de Carthage, Tunis" },
      note: "Nouveau logement",
    });
    expect(await screen.findByText("Proposition envoyée aux RH.")).toBeInTheDocument();
  });

  it("says so when nothing changed, without calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/profile-changes", () => {
        posted = true;
        return HttpResponse.json(makeProfileChange(), { status: 201 });
      }),
    );
    mount();
    await loaded();

    await send();

    expect(await screen.findByText("Rien n'a changé. Modifiez au moins un champ.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("asks for a first and a last name", async () => {
    mount();
    await loaded();

    fill("Nom", "   ");
    await send();

    expect(await screen.findByText("Ce champ est obligatoire.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a refused value next to its field and keeps what was typed", async () => {
    server.use(
      http.post("/api/v1/profile-changes", () =>
        problem(400, "core.validation", [
          {
            field: "changes.personal_email",
            code: "validation.invalid",
            detail: "Saisissez une adresse e-mail valide.",
          },
        ]),
      ),
    );
    mount();
    await loaded();

    fill("E-mail personnel", "amal@");
    fill("Téléphone", "22 333 444");
    await send();

    expect(await screen.findByText("Saisissez une adresse e-mail valide.")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail personnel")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("E-mail personnel")).toHaveValue("amal@");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("22 333 444");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("keeps the form and what was typed while the application is away", async () => {
    const { queryClient } = mount();
    await loaded();
    fill("Téléphone", "22 333 444");

    // Neither the sending nor a later reading of the record is answered by the application.
    const away = () => new HttpResponse("<html>Service unavailable</html>", { status: 503 });
    server.use(http.post("/api/v1/profile-changes", away), http.get("/api/v1/employees/me", away));
    await send();
    expect(
      await screen.findByText("L'application est en cours de mise à jour. Elle sera de retour dans un instant."),
    ).toBeInTheDocument();
    // A later reading (a return to the window) fails too; the page is then drawn again.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["employees", "me"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(["employees", "me"])?.status).toBe("error");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("22 333 444");
    expect(screen.getByRole("button", { name: "Envoyer aux RH" })).toBeInTheDocument();
  });

  it("tells about a proposal that is already waiting and keeps what was typed", async () => {
    const detail = "Une proposition attend déjà la décision des RH. Retirez-la pour en envoyer une autre.";
    server.use(
      http.post("/api/v1/profile-changes", () =>
        problem(409, "organisation.change_already_open", [
          { field: null, code: "organisation.change_already_open", detail },
        ]),
      ),
    );
    mount();
    await loaded();

    fill("Téléphone", "22 333 444");
    await send();

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Téléphone")).toHaveValue("22 333 444");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });
});
