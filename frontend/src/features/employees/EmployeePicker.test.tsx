import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { EmployeePicker } from "./EmployeePicker";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

describe("EmployeePicker", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([
          { public_id: "emp-4", name: "Amal Employee", department: "Souscription" },
          { public_id: "emp-6", name: "Nadia Manager", department: "Sinistres" },
        ]),
      ),
    );
  });

  it("lists active people with their department and reports the choice", async () => {
    const onChange = vi.fn();

    renderApp(<EmployeePicker label="Délégué" value={null} onChange={onChange} exclude={["emp-6"]} />, { me: manager });

    await screen.findByRole("option", { name: "Amal Employee · Souscription" });
    expect(screen.queryByRole("option", { name: /Nadia Manager/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Choisir une personne…" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-4");
    expect(onChange).toHaveBeenCalledWith("emp-4");
  });

  it("keeps showing a chosen person who is no longer in the directory", async () => {
    const onChange = vi.fn();

    renderApp(
      <EmployeePicker
        label="Responsable"
        value="emp-3"
        onChange={onChange}
        allowNone
        current={{ public_id: "emp-3", name: "Mounir Manager" }}
      />,
      { me: manager },
    );

    const option = await screen.findByRole("option", { name: "Mounir Manager · n'est plus actif" });
    expect(option).toHaveProperty("selected", true);
    await userEvent.selectOptions(screen.getByLabelText("Responsable"), "emp-6");
    expect(onChange).toHaveBeenCalledWith("emp-6");
  });

  it("does not repeat a chosen person the directory lists", async () => {
    renderApp(
      <EmployeePicker label="Responsable" value="emp-4" onChange={vi.fn()} current={{ public_id: "emp-4", name: "Amal Employee" }} />,
      { me: manager },
    );

    await screen.findByRole("option", { name: "Amal Employee · Souscription" });
    expect(screen.queryByRole("option", { name: /n'est plus actif/ })).not.toBeInTheDocument();
  });

  it("can offer nobody, and shows its error next to the choice", async () => {
    const onChange = vi.fn();

    renderApp(
      <EmployeePicker
        label="Responsable"
        value="emp-4"
        onChange={onChange}
        allowNone
        noneLabel="Aucun responsable"
        error="Choisissez une autre personne."
      />,
      { me: manager },
    );

    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    const select = screen.getByLabelText("Responsable");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choisissez une autre personne.")).toBeInTheDocument();
    await userEvent.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
