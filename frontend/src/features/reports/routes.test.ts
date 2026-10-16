import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { hrRoutes } from "@/workspaces/hr/routes";
import { overviewRoutes } from "@/workspaces/overview/routes";
import { teamRoutes } from "@/workspaces/team/routes";

const paths = (routes: RouteObject[]) => routes.map((route) => route.path);

describe("report routes", () => {
  it("are registered in the three workspaces that have reports", () => {
    for (const routes of [teamRoutes, hrRoutes, overviewRoutes]) {
      expect(paths(routes)).toEqual(expect.arrayContaining(["reports", "reports/:name"]));
    }
  });

  it("gives the HR desk the KPMG export", () => {
    expect(paths(hrRoutes)).toContain("reports/kpmg");
  });

  it("gives the HR desk the activity log", () => {
    expect(paths(hrRoutes)).toContain("reports/activity");
  });

  it("gives Overview the oversight pages", () => {
    expect(paths(overviewRoutes)).toEqual(
      expect.arrayContaining([
        "oversight",
        "oversight/activity",
        "oversight/security",
        "oversight/hr-settings",
        "oversight/system",
      ]),
    );
  });
});
