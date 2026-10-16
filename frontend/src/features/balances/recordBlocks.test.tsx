import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { RECORD_BLOCKS, RECORD_FACTS } from "@/features/employees/recordBlocks";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { EMPLOYEE_ID, makeBalance } from "./testing";

describe("the employee record", () => {
  it("has a Balance block for HR, managers and executives", () => {
    const block = RECORD_BLOCKS.find((candidate) => candidate.id === "balance");

    expect(block?.titleKey).toBe("balances:block.title");
    expect(block?.modes).toEqual(["hr", "team", "overview"]);
  });

  it("shows the current annual balance among the facts shown first", async () => {
    server.use(http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => HttpResponse.json(makeBalance())));
    const fact = RECORD_FACTS.find((candidate) => candidate.id === "balance");

    expect(fact?.labelKey).toBe("balances:fact.label");
    expect(fact?.modes).toEqual(["hr", "team", "overview"]);
    renderApp(<p>{fact?.render({ public_id: EMPLOYEE_ID } as never)}</p>, {
      route: "/",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    expect(await screen.findByText(/12,5\s*jours/)).toBeInTheDocument();
  });
});
