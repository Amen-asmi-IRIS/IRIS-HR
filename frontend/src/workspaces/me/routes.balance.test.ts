import { describe, expect, it } from "vitest";

import { meRoutes } from "./routes";

describe("My space routes", () => {
  it("serve the balance page at /me/balance", () => {
    expect(meRoutes.some((route) => route.path === "balance")).toBe(true);
  });
});
