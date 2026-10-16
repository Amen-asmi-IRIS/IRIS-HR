import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Setting } from "@/api/types";
import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import SettingsGroupPage from "./SettingsGroupPage";

function makeSetting(given: { key: string; kind: string; value: unknown } & Record<string, unknown>): Setting {
  return { default: given.value, minimum: null, maximum: null, choices: null, updated_by: null, updated_at: null, ...given } as Setting;
}

let stored: Setting[];
let puts: { group: string; key: string; value: unknown }[];

/** A small stand-in for the settings API: it keeps what is saved and records every PUT. */
function serving(group: "system" | "hr", refuse: Record<string, string> = {}) {
  return [
    http.get(`/api/v1/settings/${group}`, () => HttpResponse.json(stored)),
    http.put(`/api/v1/settings/${group}/:key`, async ({ params, request }) => {
      const key = String(params.key);
      const { value } = (await request.json()) as { value: unknown };
      puts.push({ group, key, value });
      if (refuse[key]) return problemResponse(400, "settings.invalid_value", refuse[key], [{ field: "value" }]);
      stored = stored.map((setting) => (setting.key === key ? ({ ...setting, value, updated_by: "Sonia Admin", updated_at: "2026-10-06T08:00:00+01:00" } as Setting) : setting));
      return HttpResponse.json(stored.find((setting) => setting.key === key));
    }),
  ];
}

beforeEach(() => {
  puts = [];
  stored = [
    makeSetting({ key: "session_timeout_minutes", kind: "int", value: 120, minimum: 5, maximum: 1440, updated_by: "Sonia Admin", updated_at: "2026-10-01T10:00:00+01:00" }),
    makeSetting({ key: "lockout_threshold", kind: "int", value: 5, minimum: 3, maximum: 20 }),
    makeSetting({ key: "upload_allowed_types", kind: "str_list", value: ["pdf", "jpg", "png"], choices: ["pdf", "jpg", "png"] }),
  ];
});

const SAVE = "Enregistrer les modifications";
const open = (props: { readOnly?: boolean } = {}) => renderApp(<SettingsGroupPage group="system" {...props} />, { route: "/admin/parameters" });
const plain = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("SettingsGroupPage", () => {
  it("shows each parameter with its label, its hint, its value and who last changed it", async () => {
    server.use(...serving("system"));
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Paramètres" })).toBeInTheDocument();
    const timeout = await screen.findByLabelText("Limite d'inactivité (minutes)");
    expect(timeout).toHaveValue("120");
    expect(timeout).toHaveAccessibleDescription("Une session se termine après cette durée sans activité. Entre 5 et 1440.");
    expect(plain(document.body)).toContain("Dernière modification par Sonia Admin le 1 oct. 2026 à 10:00.");
    expect(screen.getAllByText("Valeur par défaut, jamais modifiée.")).toHaveLength(2);
    const types = screen.getByRole("group", { name: "Types de fichiers acceptés" });
    expect(within(types).getAllByRole("checkbox").map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, true]);
    expect(within(types).getByRole("checkbox", { name: "PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument();
  });

  it("saves only what changed, each in its own JSON type, and says so", async () => {
    const user = userEvent.setup();
    server.use(...serving("system"));
    open();
    const timeout = await screen.findByLabelText("Limite d'inactivité (minutes)");
    await user.clear(timeout);
    await user.type(timeout, "90");
    await user.click(screen.getByRole("checkbox", { name: "PNG" }));
    await user.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Enregistré."));
    expect(puts).toEqual([
      { group: "system", key: "session_timeout_minutes", value: 90 },
      { group: "system", key: "upload_allowed_types", value: ["pdf", "jpg"] },
    ]);
    await waitFor(() => expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Limite d'inactivité (minutes)")).toHaveValue("90");
    expect(plain(document.body)).toContain("Dernière modification par Sonia Admin le 6 oct. 2026 à 08:00.");
  });

  it("says what is wrong with a value before calling the API", async () => {
    const user = userEvent.setup();
    server.use(...serving("system"));
    open();
    const timeout = await screen.findByLabelText("Limite d'inactivité (minutes)");
    await user.clear(timeout);
    await user.type(timeout, "deux heures");
    await user.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText("Saisissez un nombre entier.")).toBeInTheDocument();

    await user.clear(timeout);
    await user.type(timeout, "2000");
    await user.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText("Saisissez une valeur entre 5 et 1440.")).toBeInTheDocument();
    expect(timeout).toHaveValue("2000");

    for (const type of ["PDF", "JPG", "PNG"]) await user.click(screen.getByRole("checkbox", { name: type }));
    await user.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText("Choisissez-en au moins un.")).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it("puts the server's refusal next to the parameter, keeps what was typed and still saves the others", async () => {
    const user = userEvent.setup();
    server.use(...serving("system", { session_timeout_minutes: "Cette valeur est refusée." }));
    open();
    const timeout = await screen.findByLabelText("Limite d'inactivité (minutes)");
    await user.clear(timeout);
    await user.type(timeout, "30");
    const threshold = screen.getByLabelText("Échecs avant verrouillage");
    await user.clear(threshold);
    await user.type(threshold, "7");
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByText("Cette valeur est refusée.")).toBeInTheDocument();
    expect(puts.map((put) => put.key)).toEqual(["session_timeout_minutes", "lockout_threshold"]);
    await waitFor(() => expect(screen.getByLabelText("Échecs avant verrouillage")).toHaveValue("7"));
    expect(screen.getByLabelText("Limite d'inactivité (minutes)")).toHaveValue("30");
    expect(screen.getByRole("button", { name: SAVE })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps the form and what was typed when the application is away at the moment of saving", async () => {
    const user = userEvent.setup();
    server.use(...serving("system"));
    const { queryClient } = open();
    const timeout = await screen.findByLabelText("Limite d'inactivité (minutes)");
    await user.clear(timeout);
    await user.type(timeout, "90");

    // Neither the save nor the reading that follows it is answered by the application.
    const away = () => new HttpResponse("<html>Service unavailable</html>", { status: 503 });
    server.use(http.put("/api/v1/settings/system/:key", away), http.get("/api/v1/settings/system", away));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByText("L'application est en cours de mise à jour. Elle sera de retour dans un instant.")).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryState(["settings", "system"])?.status).toBe("error"));
    expect(screen.getByLabelText("Limite d'inactivité (minutes)")).toHaveValue("90");
    expect(screen.getByRole("button", { name: SAVE })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    // The application is back: the same click saves what was typed.
    server.use(...serving("system"));
    await user.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Enregistré."));
    expect(puts).toEqual([{ group: "system", key: "session_timeout_minutes", value: 90 }]);
    expect(screen.getByLabelText("Limite d'inactivité (minutes)")).toHaveValue("90");
  });

  it("is still 'not available' when a later reading says the parameters are out of reach", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(...serving("system"));
    const { queryClient } = open();
    await screen.findByLabelText("Limite d'inactivité (minutes)");
    server.use(http.get("/api/v1/settings/system", () => problemResponse(403, "core.forbidden", "Accès refusé.")));
    await queryClient.refetchQueries({ queryKey: ["settings", "system"] });
    // The page throws what it could not read; here nothing catches it, so the page is gone.
    await waitFor(() => expect(screen.queryByLabelText("Limite d'inactivité (minutes)")).not.toBeInTheDocument());
  });

  it("has a control for every kind of value, and shows the key of a parameter that has no text yet", async () => {
    const user = userEvent.setup();
    stored = [
      makeSetting({ key: "test_rate", kind: "decimal", value: "2.5", minimum: "0", maximum: "10" }),
      makeSetting({ key: "test_flag", kind: "bool", value: false }),
      makeSetting({ key: "test_days", kind: "weekdays", value: [1, 2, 3, 4, 5] }),
      makeSetting({ key: "test_cutoff", kind: "int_or_null", value: null, minimum: 1, maximum: 28 }),
      makeSetting({ key: "test_start", kind: "date_or_null", value: null }),
      makeSetting({ key: "test_words", kind: "str_list", value: ["a"] }),
    ];
    server.use(...serving("hr"));
    renderApp(<SettingsGroupPage group="hr" />, { route: "/hr/settings/parameters", path: "/hr/settings/parameters" });

    const rate = await screen.findByLabelText("test_rate");
    await user.clear(rate);
    await user.type(rate, "3,5");
    await user.click(screen.getByRole("switch", { name: "test_flag" }));
    await user.click(within(screen.getByRole("group", { name: "test_days" })).getByRole("checkbox", { name: "Samedi" }));
    await user.type(screen.getByLabelText("test_cutoff"), "25");
    await user.type(screen.getByLabelText("test_start"), "2026-11-01");
    const words = screen.getByLabelText("test_words");
    await user.clear(words);
    await user.type(words, "a, B");
    await user.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(puts).toHaveLength(6));
    expect(puts).toEqual([
      { group: "hr", key: "test_rate", value: "3.5" },
      { group: "hr", key: "test_flag", value: true },
      { group: "hr", key: "test_days", value: [1, 2, 3, 4, 5, 6] },
      { group: "hr", key: "test_cutoff", value: 25 },
      { group: "hr", key: "test_start", value: "2026-11-01" },
      { group: "hr", key: "test_words", value: ["a", "b"] },
    ]);
  });

  it("is a plain reading page when read-only", async () => {
    server.use(...serving("system"));
    open({ readOnly: true });
    expect(await screen.findByText("Limite d'inactivité (minutes)")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("PDF, JPG, PNG")).toBeInTheDocument();
    expect(plain(document.body)).toContain("Dernière modification par Sonia Admin le 1 oct. 2026 à 10:00.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
