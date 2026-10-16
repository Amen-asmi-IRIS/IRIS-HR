import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { RECORD_BLOCKS } from "@/features/employees/recordBlocks";
import { makeEmployee, pageOf } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { ProposalsBlock } from "./ProposalsBlock";
import { makeProfileChange } from "./testing";

describe("ProposalsBlock", () => {
  it("is registered on the record for the HR desk only", () => {
    const block = RECORD_BLOCKS.find((item) => item.id === "proposals");

    expect(block?.modes).toEqual(["hr"]);
    expect(block?.titleKey).toBe("profile:record.title");
  });

  it("lists the proposals of one employee and opens them", async () => {
    let asked = "";
    server.use(
      http.get("/api/v1/profile-changes", ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json(pageOf([makeProfileChange()]));
      }),
    );

    renderApp(<ProposalsBlock employee={makeEmployee()} />, {
      route: "/hr/employees/emp-1",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(asked).toContain("employee=emp-1");
    expect(asked).toContain("scope=all");
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir la proposition de Amal Employee" }));
    expect(await screen.findByRole("button", { name: "Accepter" })).toBeInTheDocument();
  });
});
