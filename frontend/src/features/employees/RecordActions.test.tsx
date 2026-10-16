import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { RecordActions } from "./RecordActions";
import { makeEmployee, makeTeamMember } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

describe("RecordActions", () => {
  it("offers edit and departure to HR for someone still employed", () => {
    renderApp(<RecordActions employee={makeEmployee()} mode="hr" />, { route: "/hr/employees/emp-1", me });

    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/employees/emp-1/edit");
    expect(screen.getByRole("button", { name: "Enregistrer un départ" })).toBeInTheDocument();
  });

  it("no longer offers a departure for someone who left", () => {
    const left = makeEmployee({ status: "archived", archived_at: "2026-11-30" });

    renderApp(<RecordActions employee={left} mode="hr" />, { route: "/hr/employees/emp-1", me });

    expect(screen.getByRole("link", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer un départ" })).not.toBeInTheDocument();
  });

  it.each(["team", "overview"] as const)("offers nothing in the %s workspace", (mode) => {
    const employee = mode === "team" ? makeTeamMember() : makeEmployee();

    renderApp(<RecordActions employee={employee} mode={mode} />, { route: "/", me });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
