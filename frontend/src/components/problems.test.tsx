import { useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, call } from "@/api/client";
import { ProblemError } from "@/api/problem";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { BeingUpdated } from "./BeingUpdated";
import { NotAvailable } from "./NotAvailable";
import { ProblemBoundary } from "./ProblemBoundary";
import { SomethingWentWrong } from "./SomethingWentWrong";

function Thrower({ error }: { error: unknown }): never {
  throw error;
}

/** A page as the plans write them: wait, throw what failed, show what was read. */
function Reader() {
  const query = useQuery({ queryKey: ["reader"], queryFn: () => call(api.GET("/api/v1/health")) });
  if (query.isPending) return <p>Lecture</p>;
  if (query.error) throw query.error;
  return <p>Version {query.data.version}</p>;
}

beforeEach(() => {
  // React reports what a boundary catches; the tests expect it.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NotAvailable", () => {
  it("says so without saying why, and leads back home", () => {
    renderApp(<NotAvailable />);
    expect(screen.getByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
    expect(screen.getByText("Cette page n'existe pas ou ne vous est pas accessible.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
  });

  it("leads to Sign in when nobody is signed in", () => {
    renderApp(<NotAvailable />, { me: null });
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/login");
  });
});

describe("SomethingWentWrong", () => {
  it("gives the reference to quote to the administrator", () => {
    renderApp(<SomethingWentWrong requestId="3f2a9c" />);
    expect(screen.getByRole("heading", { level: 1, name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : 3f2a9c")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
  });

  it("shows no reference when there is none", () => {
    renderApp(<SomethingWentWrong />);
    expect(screen.queryByText(/Référence/)).not.toBeInTheDocument();
  });
});

describe("ProblemBoundary", () => {
  it.each([403, 404])("shows 'not available' for a %i, whatever the reason", (status) => {
    renderApp(
      <ProblemBoundary>
        <Thrower error={new ProblemError({ status, code: "core.not_found", detail: "Introuvable.", requestId: "r1" })} />
      </ProblemBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
    expect(screen.queryByText("Introuvable.")).not.toBeInTheDocument();
  });

  it("shows 'something went wrong' with the reference for a server failure", () => {
    renderApp(
      <ProblemBoundary>
        <Thrower error={new ProblemError({ status: 500, code: "core.unexpected", detail: "", requestId: "req-9" })} />
      </ProblemBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : req-9")).toBeInTheDocument();
  });

  it.each([0, 502, 503, 504])("says 'being updated', not 'something went wrong', when the application is away (%i)", (status) => {
    renderApp(
      <ProblemBoundary>
        <Thrower error={new ProblemError({ status, code: "core.unavailable", detail: "" })} />
      </ProblemBoundary>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Une erreur est survenue" })).not.toBeInTheDocument();
    // The shell's page area is already the main landmark: there is no second one inside it.
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("brings the page back by itself when the application went away under it and returned", async () => {
    const user = userEvent.setup();
    let away = false;
    let asked = 0;
    server.use(
      http.get("/api/v1/health", () => {
        asked += 1;
        if (away) return new HttpResponse("<html>Bad gateway</html>", { status: 502 });
        return HttpResponse.json({ status: "ok", app: "ok", database: "ok", worker: "ok", version: "0.1.0", environment: "development" });
      }),
    );
    const { queryClient } = renderApp(
      <ProblemBoundary>
        <Reader />
      </ProblemBoundary>,
    );
    expect(await screen.findByText("Version 0.1.0")).toBeInTheDocument();

    // The page is open. Its next reading (a timer, a return to the window) finds the application away.
    away = true;
    await act(() => queryClient.refetchQueries({ queryKey: ["reader"] }));
    expect(await screen.findByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(asked).toBe(2);

    // Still away: what failed is read again, and the page says the same.
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(asked).toBe(3));
    expect(await screen.findByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();

    away = false;
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Version 0.1.0")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mise à jour en cours" })).not.toBeInTheDocument();
    expect(asked).toBe(4);
  });

  it("catches a programming error too", () => {
    renderApp(
      <ProblemBoundary>
        <Thrower error={new TypeError("x is undefined")} />
      </ProblemBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.queryByText(/x is undefined/)).not.toBeInTheDocument();
  });

  it("recovers when the user moves to another page", async () => {
    function Pages() {
      const [page, setPage] = useState("a");
      return (
        <>
          <button onClick={() => setPage("b")}>next</button>
          <ProblemBoundary resetKey={page}>{page === "a" ? <Thrower error={new Error("boom")} /> : <p>Page suivante</p>}</ProblemBoundary>
        </>
      );
    }
    renderApp(<Pages />);
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("Page suivante")).toBeInTheDocument();
  });
});

describe("BeingUpdated", () => {
  afterEach(() => vi.useRealTimers());

  it("says the application will be back, checks again by itself and on demand", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRetry = vi.fn();
    render(<BeingUpdated onRetry={onRetry} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_000));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("is a page of its own outside the shell, and a part of the page inside it", () => {
    const outside = render(<BeingUpdated onRetry={() => {}} />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    outside.unmount();
    render(<BeingUpdated onRetry={() => {}} inShell />);
    expect(screen.getByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
