import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { PEOPLE_COLUMNS } from "@/features/employees/peopleColumns";
import { makeRequest, paginated } from "@/features/requests/fixtures";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { WaitingCount } from "./WaitingCount";

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const open = () => renderApp(<WaitingCount employeeId="emp-1" name="Amal Employee" />, { route: "/team/people", path: "/team/people", me });

describe("requests waiting, in My team, People (UI 6.3)", () => {
  it("is the column registered last, after the balance", () => {
    const column = PEOPLE_COLUMNS.find((item) => item.id === "waiting");
    expect(column).toMatchObject({ order: 50, headerKey: "requests:people.waiting" });
    expect(i18n.t("requests:people.waiting", { lng: "fr" })).toBe("Demandes en attente");
    expect(i18n.t("requests:people.waiting", { lng: "en" })).toBe("Requests waiting");
  });

  it("gives the number of the person's pending requests, as a link to them", async () => {
    let search = new URLSearchParams();
    server.use(
      http.get("/api/v1/requests", ({ request }) => {
        search = new URL(request.url).searchParams;
        return HttpResponse.json(paginated([makeRequest()], 2));
      }),
    );
    open();
    const link = await screen.findByRole("link", { name: "Demandes en attente de Amal Employee : 2" });
    expect(link).toHaveTextContent("2");
    expect(link).toHaveAttribute("href", "/team/requests?employee=emp-1&status=pending");
    expect(Object.fromEntries(search)).toEqual({ scope: "team", employee: "emp-1", status: "pending", page_size: "1" });
  });

  it("says so when nothing waits, without a link", async () => {
    server.use(http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))));
    open();
    expect(await screen.findByText("Aucune")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
