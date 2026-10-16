import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeEmployee, pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import DelegationsPage from "./DelegationsPage";
import { makeDelegation } from "./testing";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

function mount(route = "/team/delegations") {
  return renderApp(<DelegationsPage />, { route, me: manager });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("DelegationsPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/me", () =>
        HttpResponse.json(makeEmployee({ public_id: "emp-3", name: "Mounir Manager" })),
      ),
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([
          { public_id: "emp-3", name: "Mounir Manager", department: "Souscription" },
          { public_id: "emp-6", name: "Nadia Manager", department: "Sinistres" },
        ]),
      ),
      http.get("/api/v1/delegations", () => HttpResponse.json(pageOf([]))),
    );
  });

  it("lists what was given and what was received, with an end action only where it applies", async () => {
    server.use(
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(
          pageOf([
            makeDelegation(),
            makeDelegation({ public_id: "del-2", state: "ended", can_end: false, start_date: "2026-09-01" }),
            makeDelegation({
              public_id: "del-3",
              direction: "received",
              state: "upcoming",
              can_end: false,
              manager: { public_id: "emp-1", name: "Karim Directeur" },
              delegate: { public_id: "emp-3", name: "Mounir Manager" },
            }),
          ]),
        ),
      ),
    );

    mount();

    expect(await screen.findAllByText("Nadia Manager")).toHaveLength(2);
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Terminer maintenant" })).toHaveLength(1);
    expect(screen.getByText("Karim Directeur")).toBeInTheDocument();
    expect(screen.getByText("À venir")).toBeInTheDocument();
  });

  it("explains an empty page and offers the action that fills it", async () => {
    mount();

    expect(await screen.findByText("Vous n'avez nommé aucun délégué")).toBeInTheDocument();
    expect(screen.getByText("Personne ne vous a délégué ses décisions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nommer un délégué" })).toBeInTheDocument();
  });

  it("names a delegate", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/delegations", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDelegation({ state: "upcoming" }), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Nommer un délégué" }));
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    // A manager cannot pick themselves.
    await waitFor(() => expect(screen.queryByRole("option", { name: /Mounir Manager/ })).not.toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    fill("Premier jour", "2026-11-09");
    fill("Dernier jour", "2026-11-13");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    await waitFor(() =>
      expect(body).toEqual({ delegate: "emp-6", start_date: "2026-11-09", end_date: "2026-11-13" }),
    );
    await waitFor(() => expect(screen.queryByLabelText("Délégué")).not.toBeInTheDocument());
  });

  it("checks the order of the dates before calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/delegations", () => {
        posted = true;
        return HttpResponse.json(makeDelegation(), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Nommer un délégué" }));
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    fill("Premier jour", "2026-11-13");
    fill("Dernier jour", "2026-11-09");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    expect(await screen.findByText("Le dernier jour ne peut pas précéder le premier.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("shows a refusal of the server next to the dates and keeps them", async () => {
    server.use(
      http.post("/api/v1/delegations", () =>
        problem(400, "organisation.delegation_overlap", [
          {
            field: "start_date",
            code: "organisation.delegation_overlap",
            detail: "Une autre délégation couvre déjà une partie de ces dates.",
          },
        ]),
      ),
    );
    mount("/team/delegations?from=2026-11-09&to=2026-11-13");

    // The address opened the sheet already filled in.
    expect(await screen.findByLabelText("Premier jour")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Dernier jour")).toHaveValue("2026-11-13");
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    expect(await screen.findByText("Une autre délégation couvre déjà une partie de ces dates.")).toBeInTheDocument();
    expect(screen.getByLabelText("Premier jour")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Délégué")).toHaveValue("emp-6");
  });

  it("keeps the open sheet and what was typed while the application is away", async () => {
    const { queryClient } = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Nommer un délégué" }));
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    fill("Premier jour", "2026-11-09");

    // The list is read again (a return to the window) while the application restarts.
    server.use(
      http.get("/api/v1/delegations", () => new HttpResponse("<html>Service unavailable</html>", { status: 503 })),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["delegations"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(["delegations", "list", { scope: "mine" }])?.status).toBe("error");
    expect(screen.getByLabelText("Délégué")).toHaveValue("emp-6");
    expect(screen.getByLabelText("Premier jour")).toHaveValue("2026-11-09");
  });

  it("ends a running delegation only after stating the consequence", async () => {
    let ended = false;
    server.use(
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(pageOf([ended ? makeDelegation({ state: "ended", can_end: false }) : makeDelegation()])),
      ),
      http.post("/api/v1/delegations/del-1/end", () => {
        ended = true;
        return HttpResponse.json(makeDelegation({ state: "ended", can_end: false }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Terminer maintenant" }));

    expect(
      await screen.findByText(
        "Nadia Manager ne pourra plus décider à la place du responsable ni voir son équipe, dès maintenant.",
      ),
    ).toBeInTheDocument();
    expect(ended).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    await waitFor(() => expect(ended).toBe(true));
    // Said even though the refreshed list no longer has a row that can be ended.
    expect(await screen.findByText("Délégation terminée.")).toBeInTheDocument();
  });
});
