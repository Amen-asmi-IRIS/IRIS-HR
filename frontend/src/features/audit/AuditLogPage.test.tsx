import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/api/types";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AuditLogPage from "./AuditLogPage";
import { actionLabel, NOT_AN_ADDRESS, objectLabel, SECURITY_ACTIONS } from "./labels";
import i18n from "@/i18n";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 41,
    at: "2026-10-05T09:12:00+01:00",
    actor: "Sonia Admin",
    category: "security",
    action: "auth.login_failed",
    object_type: "user",
    object_id: "a1",
    object_label: "sami.benali@impactrisks.com",
    changes: {},
    ip_address: "10.0.0.12",
    request_id: "req-41",
    ...overrides,
  } as AuditEvent;
}

const roleGiven = makeEvent({
  id: 40,
  action: "role.assigned",
  object_label: "leila.trabelsi@impactrisks.com",
  changes: { roles: { before: [], after: ["hr"] }, is_active: { before: false, after: true }, note: { changed: true }, phone: { before: "", after: null } },
});
const bySystem = makeEvent({ id: 39, actor: null, action: "auth.locked", ip_address: null });

const accounts = makePage([
  { public_id: "u1", email: "sysadmin@impactrisks.com", name: "Sonia Admin", state: "active", roles: ["sysadmin"], last_login_at: null, has_employee: false },
  { public_id: "u2", email: "ceo@impactrisks.com", name: "Karim Directeur", state: "active", roles: ["exec"], last_login_at: null, has_employee: false },
]);

function logging(category: "security" | "business", seen: URLSearchParams[], events: AuditEvent[] = [makeEvent(), roleGiven, bySystem], count?: number) {
  return http.get(`/api/v1/audit/${category}`, ({ request }) => {
    seen.push(new URL(request.url).searchParams);
    return HttpResponse.json(makePage(events, count));
  });
}
const listsAccounts = () => http.get("/api/v1/accounts", () => HttpResponse.json(accounts));

describe("labels", () => {
  it("has a text in both languages for every security action of the API", async () => {
    for (const action of SECURITY_ACTIONS) {
      expect(actionLabel(action, i18n.t, i18n)).not.toBe(action);
    }
    expect(actionLabel("auth.login_failed", i18n.t, i18n)).toBe("Échec de connexion");
    expect(actionLabel("something.new", i18n.t, i18n)).toBe("something.new");
  });

  it("knows the fixed text the API stores when what was typed at sign-in was not an address", () => {
    // The API never keeps such text: it may be a password typed in the wrong box. It stores this constant instead.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../../../backend/apps/accounts/emails.py"), "utf8");
    expect(source).toContain(`NOT_AN_ADDRESS = "${NOT_AN_ADDRESS}"`);
  });

  it("puts the fixed texts of the API in the reader's language and leaves every other label as it is", async () => {
    const failed = makeEvent({ object_label: NOT_AN_ADDRESS });
    const exported = makeEvent({ action: "audit.exported", object_type: "audit_log", object_label: "security" });
    expect(objectLabel(failed, i18n.t)).toBe("(pas une adresse e-mail)");
    expect(objectLabel(exported, i18n.t)).toBe("Journal de sécurité");
    expect(objectLabel(makeEvent({ action: "audit.exported", object_type: "audit_log", object_label: "business" }), i18n.t)).toBe("Journal d'activité");
    expect(objectLabel(makeEvent(), i18n.t)).toBe("sami.benali@impactrisks.com");
    // An account is never renamed by the page, even if its label happens to be the word "security".
    expect(objectLabel(makeEvent({ object_label: "security" }), i18n.t)).toBe("security");

    await i18n.changeLanguage("en");
    expect(objectLabel(failed, i18n.t)).toBe("(not an email address)");
    expect(objectLabel(exported, i18n.t)).toBe("Security log");
  });

  it("names a file recorded without its name by its kind, in the reader's language", async () => {
    // The files service records a medical file as "kind:identifier", never by its name (plan 02).
    const medical = makeEvent({
      action: "attachment.downloaded",
      object_type: "attachment",
      object_label: "medical:0f0e0d0c-0000-4000-8000-000000000001",
    });
    expect(objectLabel(medical, i18n.t)).toBe("Pièce médicale");
    // A file recorded under its own name keeps it, and so does anything that is not a file.
    expect(objectLabel(makeEvent({ object_type: "attachment", object_label: "contrat.pdf" }), i18n.t)).toBe("contrat.pdf");
    expect(objectLabel(makeEvent({ object_label: medical.object_label }), i18n.t)).toBe(medical.object_label);

    await i18n.changeLanguage("en");
    expect(objectLabel(medical, i18n.t)).toBe("Medical document");
  });

  it("names an exported report and a KPMG export in the reader's language, whoever exported them", async () => {
    // The services record the title in the exporter's language (plan 06): the page names them again.
    const report = makeEvent({ action: "report.exported", object_type: "report", object_id: "absences", object_label: "Absences taken" });
    const kpmg = makeEvent({ action: "export.kpmg", object_type: "export", object_id: "kpmg", object_label: "KPMG export 2026-11-01 2026-11-30" });
    expect(objectLabel(report, i18n.t)).toBe("Absences prises");
    expect(objectLabel(kpmg, i18n.t)).toBe("Export KPMG : 1 nov. 2026 – 30 nov. 2026");
    // A report the page does not know keeps its stored label.
    expect(objectLabel(makeEvent({ action: "report.exported", object_type: "report", object_id: "payroll", object_label: "Payroll" }), i18n.t)).toBe("Payroll");

    await i18n.changeLanguage("en");
    expect(objectLabel(report, i18n.t)).toBe("Absences taken");
    expect(objectLabel(kpmg, i18n.t)).toBe("KPMG export: 1 Nov 2026 – 30 Nov 2026");
  });

  it("names a changed parameter by its label, and by its key while it has none", async () => {
    const changed = makeEvent({ action: "setting.changed", object_type: "setting", object_id: "session_timeout_minutes", object_label: "session_timeout_minutes" });
    expect(objectLabel(changed, i18n.t)).toBe("Limite d'inactivité (minutes)");
    expect(objectLabel(makeEvent({ action: "setting.changed", object_type: "setting", object_label: "not_registered_yet" }), i18n.t)).toBe("not_registered_yet");
    // Only a parameter is looked up: an account whose label happens to be a key keeps it.
    expect(objectLabel(makeEvent({ object_label: "session_timeout_minutes" }), i18n.t)).toBe("session_timeout_minutes");

    await i18n.changeLanguage("en");
    expect(objectLabel(changed, i18n.t)).toBe("Inactivity limit (minutes)");
  });
});

describe("AuditLogPage, security", () => {
  it("shows when, who, what happened, on what and from where", async () => {
    const seen: URLSearchParams[] = [];
    server.use(logging("security", seen), listsAccounts());
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    expect(screen.getByRole("heading", { level: 1, name: "Journal de sécurité" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Journal de sécurité" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Quand", "Qui", "Ce qui s'est passé", "Sur quoi", "Adresse réseau"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect((rows[0].textContent ?? "").replace(/\s/g, " ")).toContain("5 oct. 2026 à 09:12");
    expect(within(rows[0]).getByText("Sonia Admin")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Échec de connexion")).toBeInTheDocument();
    expect(within(rows[0]).getByText("sami.benali@impactrisks.com")).toBeInTheDocument();
    expect(within(rows[0]).getByText("10.0.0.12")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Le système")).toBeInTheDocument();
    expect(seen[0].get("page_size")).toBe("25");
  });

  it("filters by period, account and kind of event, and exports what is shown", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(logging("security", seen), listsAccounts());
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    await screen.findByRole("table", { name: "Journal de sécurité" });

    await user.selectOptions(await screen.findByRole("combobox", { name: "Qui" }), "u2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type d'événement" }), "auth.login_failed");
    const period = screen.getByRole("group", { name: "Période" });
    await user.type(within(period).getByLabelText("Du"), "2026-10-01");
    await user.type(within(period).getByLabelText("Au"), "2026-10-05");

    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.get("actor")).toBe("u2");
      expect(last?.get("action")).toBe("auth.login_failed");
      expect(last?.get("from")).toBe("2026-10-01");
      expect(last?.get("to")).toBe("2026-10-05");
    });
    expect(screen.getByRole("link", { name: "Exporter vers Excel" })).toHaveAttribute(
      "href",
      "/api/v1/audit/security/export?from=2026-10-01&to=2026-10-05&actor=u2&action=auth.login_failed",
    );
    expect(screen.queryByRole("button", { name: "Plus de filtres" })).not.toBeInTheDocument();
  });

  it("reads a period typed backwards the right way round", async () => {
    const seen: URLSearchParams[] = [];
    server.use(logging("security", seen), listsAccounts());
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log?from=2026-10-09&to=2026-10-01" });
    await screen.findByRole("table", { name: "Journal de sécurité" });
    expect(seen[0].get("from")).toBe("2026-10-01");
    expect(seen[0].get("to")).toBe("2026-10-09");
  });

  it("opens an event with its reference and what changed", async () => {
    const user = userEvent.setup();
    server.use(logging("security", []), listsAccounts());
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    const table = await screen.findByRole("table", { name: "Journal de sécurité" });
    await user.click(within(within(table).getAllByRole("row")[2]).getByRole("button"));

    const sheet = await screen.findByRole("dialog", { name: "Rôle attribué" });
    expect(within(sheet).getByText("leila.trabelsi@impactrisks.com")).toBeInTheDocument();
    expect(within(sheet).getByText("req-41")).toBeInTheDocument();
    const changes = within(sheet).getByRole("table", { name: "Ce qui a changé" });
    const cells = (name: string) =>
      [...within(changes).getByRole("row", { name: new RegExp(`^${name}`) }).querySelectorAll("th, td")].map((cell) => cell.textContent);
    expect(cells("roles")).toEqual(["roles", "vide", "hr"]);
    expect(cells("is_active")).toEqual(["is_active", "Non", "Oui"]);
    expect(cells("note")).toEqual(["note", "", "modifié"]);
    expect(cells("phone")).toEqual(["phone", "vide", "vide"]);

    await user.click(within(sheet).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a failed sign-in whose text was not an address in the reader's language, never in the other", async () => {
    const user = userEvent.setup();
    server.use(logging("security", [], [makeEvent({ object_id: "", object_label: NOT_AN_ADDRESS })]), listsAccounts());
    const french = renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    const table = await screen.findByRole("table", { name: "Journal de sécurité" });
    expect(within(table).getByText("(pas une adresse e-mail)")).toBeInTheDocument();
    expect(screen.queryByText(NOT_AN_ADDRESS)).not.toBeInTheDocument();

    await user.click(within(within(table).getAllByRole("row")[1]).getByRole("button"));
    const sheet = await screen.findByRole("dialog", { name: "Échec de connexion" });
    expect(within(sheet).getByText("(pas une adresse e-mail)")).toBeInTheDocument();
    expect(screen.queryByText(NOT_AN_ADDRESS)).not.toBeInTheDocument();
    french.unmount();

    await i18n.changeLanguage("en");
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    const english = await screen.findByRole("table", { name: "Security log" });
    expect(within(english).getByText("(not an email address)")).toBeInTheDocument();
    expect(screen.queryByText("(pas une adresse e-mail)")).not.toBeInTheDocument();
  });

  it("names the log that was exported in the reader's language", async () => {
    const exported = makeEvent({ action: "audit.exported", object_type: "audit_log", object_id: "", object_label: "security" });
    server.use(logging("security", [], [exported]), listsAccounts());
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    const table = await screen.findByRole("table", { name: "Journal de sécurité" });
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("Journal exporté")).toBeInTheDocument();
    expect(within(row).getByText("Journal de sécurité")).toBeInTheDocument();
    expect(within(row).queryByText("security")).not.toBeInTheDocument();
  });

  it("explains an empty result and pages through a long one", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(logging("security", seen, [], 0), listsAccounts());
    const first = renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    expect(await screen.findByText("Aucun événement de sécurité ne correspond à ces filtres.")).toBeInTheDocument();
    first.unmount();

    server.use(logging("security", seen, [makeEvent()], 60));
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log" });
    await user.click(await screen.findByRole("button", { name: "Page suivante" }));
    await waitFor(() => expect(seen.at(-1)?.get("page")).toBe("2"));
  });
});

describe("AuditLogPage, activity", () => {
  it("reads the business log and does not list accounts for a reader who may not", async () => {
    const seen: URLSearchParams[] = [];
    const listed = vi.fn();
    server.use(
      logging("business", seen, [makeEvent({ category: "business", action: "employee.archived", object_label: "Nour Gharbi" })]),
      http.get("/api/v1/accounts", () => {
        listed();
        return HttpResponse.json(accounts);
      }),
    );
    renderApp(<AuditLogPage category="business" />, { route: "/hr/reports/activity", path: "/hr/reports/activity", me: makeMe({ roles: ["employee", "hr"] }) });
    expect(screen.getByRole("heading", { level: 1, name: "Journal d'activité" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Journal d'activité" });
    expect(within(table).getByText("Départ enregistré")).toBeInTheDocument();
    expect(seen).toHaveLength(1);
    expect(listed).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exporter vers Excel" })).toHaveAttribute("href", "/api/v1/audit/business/export");
  });

  it("takes the people, the kinds of event and the kinds of item it is given", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(logging("business", seen, []));
    renderApp(
      <AuditLogPage
        category="business"
        actors={[{ value: "u9", label: "Senna RH" }]}
        actionOptions={[{ value: "employee.archived", label: "Départ enregistré" }]}
        itemTypeOptions={[{ value: "employee", label: "Employé" }]}
      />,
      { route: "/hr/reports/activity", path: "/hr/reports/activity", me: makeMe({ roles: ["employee", "hr"] }) },
    );
    await user.selectOptions(await screen.findByRole("combobox", { name: "Qui" }), "u9");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type d'événement" }), "employee.archived");
    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Type d'élément" }), "employee");
    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.get("actor")).toBe("u9");
      expect(last?.get("action")).toBe("employee.archived");
      expect(last?.get("object_type")).toBe("employee");
    });
  });
});
