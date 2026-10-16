import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequestDetail, problemResponse } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { workspaceFor } from "./platform";
import RequestRedirect from "./RequestRedirect";
import type { ViewerRelation } from "./types";

vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  NotAvailable: () => <p>indisponible</p>,
}));

function open(relation: ViewerRelation, workspaces: WorkspaceId[]) {
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail({ viewer: { relation, actions: [], step_id: null } }))),
  );
  renderApp(<RequestRedirect />, {
    route: "/requests/req-1",
    path: "/requests/:id",
    me: makeMe({ roles: ["employee"], workspaces }),
  });
}

describe("/requests/:id opens in the workspace matching the viewer (UI 11)", () => {
  it.each([
    ["owner", ["me", "team", "hr"], "/me/requests/req-1"],
    ["approver", ["me", "team"], "/team/requests/req-1"],
    ["team", ["me", "team"], "/team/requests/req-1"],
    ["hr", ["me", "hr"], "/hr/requests/req-1"],
    ["overview", ["me", "team", "overview"], "/overview/requests/req-1"],
    ["approver", ["me"], "/me/requests/req-1"],
    ["approver", ["me", "overview"], "/me/requests/req-1"],
  ] as const)("a viewer who is %s with %j lands on %s", async (relation, workspaces, target) => {
    open(relation, [...workspaces]);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(target);
  });

  it("is not available when the request is outside the viewer's reach", async () => {
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    renderApp(<RequestRedirect />, {
      route: "/requests/req-1",
      path: "/requests/:id",
      me: makeMe({ roles: ["employee"], workspaces: ["me"] }),
    });
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});

describe("workspaceFor", () => {
  it("never sends anyone to a workspace they do not have", () => {
    expect(workspaceFor("hr", ["me"])).toBe("me");
    expect(workspaceFor("overview", ["me"])).toBe("me");
    expect(workspaceFor("team", ["me", "hr"])).toBe("hr");
  });
});
