import { useMutation } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { useWorkspaceCounts } from "./workspaceCounts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

function Probe({ enabled = true }: { enabled?: boolean }) {
  const counts = useWorkspaceCounts(enabled);
  const action = useMutation({ mutationFn: async () => "done" });
  const failing = useMutation({ mutationFn: async () => { throw new Error("refused"); } });
  return (
    <div>
      <output data-testid="counts">{JSON.stringify(counts)}</output>
      <button type="button" onClick={() => action.mutate()}>act</button>
      <button type="button" onClick={() => failing.mutate()}>fail</button>
    </div>
  );
}

const me = makeMe({ roles: ["employee", "manager"] });
const counts = () => screen.getByTestId("counts");
const open = () => renderApp(<Probe />, { route: "/team", path: "/team", me });

/** Serves the summary and counts how often it was read; the team count goes down after the first read. */
function serveSummary() {
  let reads = 0;
  server.use(http.get("/api/v1/workspaces/summary", () => {
    reads += 1;
    return HttpResponse.json({ me: 0, team: reads === 1 ? 3 : 2, hr: 0, overview: 0, admin: 0 });
  }));
  return () => reads;
}

describe("useWorkspaceCounts", () => {
  it("is empty until the server answers, then holds the five numbers", async () => {
    server.use(http.get("/api/v1/workspaces/summary", () => HttpResponse.json({ me: 1, team: 3, hr: 0, overview: 0, admin: 0 })));
    open();

    expect(counts()).toHaveTextContent("{}");
    await waitFor(() => expect(counts()).toHaveTextContent('{"me":1,"team":3,"hr":0,"overview":0,"admin":0}'));
  });

  it("reads the numbers again after a successful action", async () => {
    const user = userEvent.setup();
    const reads = serveSummary();
    open();
    await waitFor(() => expect(counts()).toHaveTextContent('"team":3'));

    await user.click(screen.getByRole("button", { name: "act" }));

    await waitFor(() => expect(counts()).toHaveTextContent('"team":2'));
    expect(reads()).toBe(2);
  });

  it("does not read again after an action that failed", async () => {
    const user = userEvent.setup();
    const reads = serveSummary();
    open();
    await waitFor(() => expect(counts()).toHaveTextContent('"team":3'));

    await user.click(screen.getByRole("button", { name: "fail" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reads()).toBe(1);
    expect(counts()).toHaveTextContent('"team":3');
  });

  it("reads nothing when it is not enabled, not even after an action", async () => {
    const user = userEvent.setup();
    const reads = serveSummary();
    renderApp(<Probe enabled={false} />, { route: "/team", path: "/team", me });

    await user.click(screen.getByRole("button", { name: "act" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reads()).toBe(0);
    expect(counts()).toHaveTextContent("{}");
  });

  it("is read by the switcher of a person with several workspaces, never for a single one", async () => {
    const reads = serveSummary();
    const { unmount } = renderApp(<WorkspaceSwitcher current="me" />, {
      route: "/me", path: "/me", me: makeMe({ roles: ["employee"] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toBe(0);
    unmount();

    renderApp(<WorkspaceSwitcher current="team" />, { route: "/team", path: "/team", me });
    await waitFor(() => expect(reads()).toBe(1));
  });

  it("stays empty when the server refuses", async () => {
    server.use(http.get("/api/v1/workspaces/summary", () =>
      problemResponse(403, "auth.password_change_required", "Choisissez un nouveau mot de passe.")));
    open();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(counts()).toHaveTextContent("{}");
  });
});
