import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { RECORD_BLOCKS, type RecordMode } from "@/features/employees/recordBlocks";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { EmployeeRequestsBlock } from "./EmployeeRequestsBlock";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const RECORDS: Record<RecordMode, string> = {
  hr: "/hr/employees/emp-1",
  team: "/team/people/emp-1",
  overview: "/overview/people/emp-1",
};

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([makeRequest({ viewer: { relation: "hr", actions: [], step_id: null } })]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
  );
  return searches;
}

function open(mode: RecordMode) {
  const route = RECORDS[mode];
  return renderApp(<EmployeeRequestsBlock employeeId="emp-1" mode={mode} />, {
    route,
    path: route.replace("emp-1", ":id"),
    me: makeMe({ roles: ["employee", "manager", "hr", "exec"], workspaces: ["me", "team", "hr", "overview"] }),
  });
}

describe("the Requests block of the employee record (UI 7.9, 6.3)", () => {
  it("is registered between the documents and the balance, for the three kinds of record", () => {
    const block = RECORD_BLOCKS.find((item) => item.id === "requests");
    expect(block).toMatchObject({ order: 40, modes: ["hr", "team", "overview"], titleKey: "requests:recordBlock.title" });
    expect(i18n.t("requests:recordBlock.title", { lng: "fr" })).toBe("Demandes");
    expect(i18n.t("requests:recordBlock.title", { lng: "en" })).toBe("Requests");
  });

  it("on the HR desk: lists the employee's requests and offers a new one for them", async () => {
    const searches = serve();
    open("hr");
    expect(await screen.findByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
    expect(searches[0].get("employee")).toBe("emp-1");
    expect(screen.getByRole("link", { name: "Nouvelle demande pour cet employé" })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });

  it("in My team: lists what the manager may see of the person, with nothing to create", async () => {
    const searches = serve();
    open("team");
    await screen.findByText("R(2026-11-09..2026-11-11)");
    expect(searches[0].get("scope")).toBe("team");
    expect(searches[0].get("employee")).toBe("emp-1");
    expect(screen.queryByRole("link", { name: "Nouvelle demande pour cet employé" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team/requests/req-1");
  });

  it("in Overview: lists the requests, read-only", async () => {
    const searches = serve();
    open("overview");
    await screen.findByText("R(2026-11-09..2026-11-11)");
    expect(searches[0].get("scope")).toBe("all");
    expect(screen.queryByRole("link", { name: "Nouvelle demande pour cet employé" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/overview/requests/req-1");
  });

  it("keeps its rows while the application is away, so the record and its open sheet stay", async () => {
    serve();
    const { queryClient } = open("hr");
    expect(await screen.findByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    // A later reading (a return to the window) is not answered by the application.
    server.use(http.get("/api/v1/requests", () => new HttpResponse("<html>Service unavailable</html>", { status: 503 })));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["requests"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(queryClient.getQueryCache().findAll({ queryKey: ["requests", "list"] })[0]?.state.status).toBe("error");
    expect(screen.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
  });

  it("says when the person has no request", async () => {
    server.use(
      http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))),
      http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    );
    open("hr");
    expect(await screen.findByText("Aucune demande.")).toBeInTheDocument();
  });
});
