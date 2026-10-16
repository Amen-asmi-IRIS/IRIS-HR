import { useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { call, api } from "@/api/client";
import { ProblemBoundary } from "@/components";
import { problemResponse } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { Gate } from "./Gate";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

function Probe({ form = false }: { form?: boolean }) {
  const query = useQuery({
    queryKey: ["probe"],
    queryFn: () => call(api.GET("/api/v1/request-types")),
    retry: false,
  });
  return (
    <Gate query={query} form={form}>
      {(types) => <p>{`${(types as unknown[]).length} types`}</p>}
    </Gate>
  );
}

const show = (form: boolean) =>
  renderApp(
    <ProblemBoundary>
      <Probe form={form} />
    </ProblemBoundary>,
    { route: "/me", path: "/me", me },
  );

const away = () => new HttpResponse("<html>Service unavailable</html>", { status: 503 });

describe("Gate", () => {
  it("draws its children with the data", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    show(false);
    expect(await screen.findByText("0 types")).toBeInTheDocument();
  });

  it("says not available for a 404 or a 403", async () => {
    server.use(http.get("/api/v1/request-types", () => problemResponse(403, "core.not_allowed", "Non.")));
    show(false);
    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });

  it("says something went wrong for any other failure", async () => {
    server.use(http.get("/api/v1/request-types", () => problemResponse(500, "core.unexpected", "Oups.")));
    show(false);
    expect(await screen.findByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
  });

  it("leaves the outage to the shell, which says the application is being updated", async () => {
    // React reports the error the boundary catches.
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("/api/v1/request-types", away));
    show(false);
    expect(await screen.findByRole("heading", { name: "Mise à jour en cours" })).toBeInTheDocument();
  });

  it("keeps a form drawn when a later reading only says the application is away", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    const { queryClient } = show(true);
    expect(await screen.findByText("0 types")).toBeInTheDocument();
    server.use(http.get("/api/v1/request-types", away));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["probe"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(queryClient.getQueryState(["probe"])?.status).toBe("error"));
    expect(screen.getByText("0 types")).toBeInTheDocument();
  });

  it("does not keep what it only shows: old figures give way to 'being updated'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    const { queryClient } = show(false);
    expect(await screen.findByText("0 types")).toBeInTheDocument();
    server.use(http.get("/api/v1/request-types", away));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["probe"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await screen.findByRole("heading", { name: "Mise à jour en cours" })).toBeInTheDocument();
  });
});
