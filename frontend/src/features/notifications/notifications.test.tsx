import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { Notification } from "@/api/types";
import { makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { isInsideLink } from "./api";
import { NotificationsBell } from "./NotificationsBell";
import NotificationsPage from "./NotificationsPage";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 7,
    event: "account.password_reset",
    title: "Mot de passe réinitialisé",
    body: "Votre mot de passe a été réinitialisé par Samia Admin.",
    link: "/password",
    created_at: "2026-10-05T09:00:00+01:00",
    read_at: null,
    ...overrides,
  } as Notification;
}

const older = makeNotification({ id: 5, title: "Tâche planifiée en échec", body: "accounts.cleanup", link: "/admin", read_at: "2026-10-04T10:00:00+01:00" });

const counts = (count: number) => http.get("/api/v1/notifications/unread-count", () => HttpResponse.json({ count }));
const lists = (...items: Notification[]) => http.get("/api/v1/notifications", () => HttpResponse.json(makePage(items)));
const noContent = () => new HttpResponse(null, { status: 204 });

describe("isInsideLink", () => {
  it.each(["/requests/abc", "/me/requests?state=waiting", "/notifications"])("follows the inside link %s", (link) => {
    expect(isInsideLink(link)).toBe(true);
  });

  // As for the return address of Sign in: a browser reads a backslash as a slash and drops tabs and line breaks.
  it.each([
    ["nothing", ""],
    ["an address without its slash", "requests/abc"],
    ["another site", "https://evil.example/x"],
    ["two slashes", "//evil.example"],
    ["a backslash", "/\\evil.example"],
    ["a backslash further in", "/requests\\evil.example"],
    ["a tab", "/\t/evil.example"],
    ["a line break", "/\n/evil.example"],
  ])("does not follow %s", (_what, link) => {
    expect(isInsideLink(link)).toBe(false);
  });
});

describe("NotificationsBell", () => {
  it("announces how many notifications are unread", async () => {
    server.use(counts(3));
    renderApp(<NotificationsBell />, { route: "/admin" });
    expect(await screen.findByRole("button", { name: "Notifications, 3 non lues" })).toBeInTheDocument();
  });

  it("shows the latest ones, marks the opened one as read and goes to its item", async () => {
    const user = userEvent.setup();
    const read = vi.fn();
    server.use(
      counts(1),
      lists(makeNotification(), older),
      http.post("/api/v1/notifications/:id/read", ({ params }) => {
        read(params.id);
        return noContent();
      }),
    );
    renderApp(<NotificationsBell />, { route: "/admin" });
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 non lue" }));
    const popover = await screen.findByRole("dialog", { name: "Dernières notifications" });
    expect(await within(popover).findAllByRole("listitem")).toHaveLength(2);
    expect(within(popover).getByRole("link", { name: "Voir toutes les notifications" })).toHaveAttribute("href", "/notifications");

    await user.click(within(popover).getByRole("button", { name: /Mot de passe réinitialisé/ }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/password");
    await waitFor(() => expect(read).toHaveBeenCalledWith("7"));
  });

  it("does not follow a link that leaves the application", async () => {
    const user = userEvent.setup();
    server.use(counts(1), lists(makeNotification({ link: "https://evil.example/x" })), http.post("/api/v1/notifications/:id/read", noContent));
    const { router } = renderApp(<NotificationsBell />, { route: "/admin" });
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 non lue" }));
    await user.click(await screen.findByRole("button", { name: /Mot de passe réinitialisé/ }));
    expect(router.state.location.pathname).toBe("/admin");
  });

  it("says when there is nothing", async () => {
    const user = userEvent.setup();
    renderApp(<NotificationsBell />, { route: "/admin" });
    await user.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Vous n'avez aucune notification.")).toBeInTheDocument();
  });
});

describe("NotificationsPage", () => {
  it("lists what happened, about what and when, and marks one as read", async () => {
    const user = userEvent.setup();
    let item = makeNotification();
    server.use(
      counts(1),
      http.get("/api/v1/notifications", () => HttpResponse.json(makePage([item, older]))),
      http.post("/api/v1/notifications/:id/read", () => {
        item = makeNotification({ read_at: "2026-10-05T10:00:00+01:00" });
        return noContent();
      }),
    );
    renderApp(<NotificationsPage />, { route: "/notifications" });
    expect(screen.getByRole("heading", { level: 1, name: "Notifications" })).toBeInTheDocument();
    const rows = await within(await screen.findByRole("list", { name: "Notifications" })).findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Mot de passe réinitialisé")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Votre mot de passe a été réinitialisé par Samia Admin.")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Non lue")).toBeInTheDocument();
    expect((rows[0].textContent ?? "").replace(/\s/g, " ")).toContain("5 oct. 2026 à 09:00");
    expect(within(rows[1]).queryByText("Non lue")).not.toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button", { name: /Marquer comme lue/ })).not.toBeInTheDocument();

    await user.click(within(rows[0]).getByRole("button", { name: "Marquer comme lue : Mot de passe réinitialisé" }));
    await waitFor(() => expect(screen.queryByText("Non lue")).not.toBeInTheDocument());
  });

  it("offers 'mark all as read' only while something is unread", async () => {
    const user = userEvent.setup();
    let unread = 2;
    const all = vi.fn();
    server.use(
      http.get("/api/v1/notifications/unread-count", () => HttpResponse.json({ count: unread })),
      lists(makeNotification(), makeNotification({ id: 8 })),
      http.post("/api/v1/notifications/read-all", () => {
        all();
        unread = 0;
        return noContent();
      }),
    );
    renderApp(<NotificationsPage />, { route: "/notifications" });
    await user.click(await screen.findByRole("button", { name: "Tout marquer comme lu" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tout marquer comme lu" })).not.toBeInTheDocument());
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("filters on unread and explains an empty result", async () => {
    const user = userEvent.setup();
    const asked: (string | null)[] = [];
    server.use(
      http.get("/api/v1/notifications", ({ request }) => {
        const unread = new URL(request.url).searchParams.get("unread");
        asked.push(unread);
        return HttpResponse.json(makePage(unread ? [] : [older]));
      }),
    );
    const { router } = renderApp(<NotificationsPage />, { route: "/notifications" });
    await screen.findByText("Tâche planifiée en échec");
    await user.click(screen.getByRole("button", { name: "Non lues uniquement" }));
    expect(await screen.findByText("Vous avez tout lu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Non lues uniquement" })).toHaveAttribute("aria-pressed", "true");
    expect(router.state.location.search).toBe("?unread=1");
    expect(asked[0]).toBeNull();
    expect(asked.at(-1)).not.toBeNull();
  });

  it("opens an item from the list", async () => {
    const user = userEvent.setup();
    server.use(lists(older));
    renderApp(<NotificationsPage />, { route: "/notifications" });
    await user.click(await screen.findByRole("button", { name: "Ouvrir : Tâche planifiée en échec" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin");
  });
});
