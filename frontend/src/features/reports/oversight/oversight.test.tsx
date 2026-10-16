import { cleanup, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import OversightHubPage from "./OversightHubPage";
import OversightIndexPage from "./OversightIndexPage";
import { oversightRoutes } from "./routes";

const { mounted, stub } = vi.hoisted(() => {
  const mounted: { page: string; props: Record<string, unknown> }[] = [];
  const stub = (page: string) => ({
    default: (props: Record<string, unknown>) => {
      mounted.push({ page, props });
      return page;
    },
  });
  return { mounted, stub };
});

vi.mock("@/features/audit/AuditLogPage", () => stub("AuditLogPage"));
vi.mock("@/features/reports/ActivityLogPage", () => stub("ActivityLogPage"));
vi.mock("@/features/settings/SettingsGroupPage", () => stub("SettingsGroupPage"));
vi.mock("@/features/accounts/StatusPage", () => stub("StatusPage"));
vi.mock("@/features/accounts/AccountsPage", () => stub("AccountsPage"));
vi.mock("@/features/accounts/AccountPage", () => stub("AccountPage"));
vi.mock("@/features/employees/DepartmentsPositionsPage", () => stub("DepartmentsPositionsPage"));
vi.mock("@/features/requests/settings/RequestTypesPage", () => stub("RequestTypesPage"));
vi.mock("@/features/requests/settings/TypeStepsPage", () => stub("TypeStepsPage"));
vi.mock("@/features/requests/settings/EventsPage", () => stub("EventsPage"));
vi.mock("@/features/requests/settings/HolidaysPage", () => stub("HolidaysPage"));
vi.mock("@/features/settings/hrSubjects", () => ({
  HR_SETTINGS_SUBJECTS: [
    { id: "departments", path: "/hr/settings/departments", titleKey: "reports:oversight.system.accounts", descriptionKey: "reports:oversight.read_only", order: 60 },
    { id: "request-types", path: "/hr/settings/request-types", titleKey: "reports:oversight.system.status", descriptionKey: "reports:oversight.read_only", order: 10 },
    { id: "something-new", path: "/hr/settings/something-new", titleKey: "reports:title", descriptionKey: "reports:title", order: 70 },
  ],
}));

const exec = makeMe({ roles: ["employee", "exec"] });

// The pages of earlier plans are loaded lazily, as in every workspace's routes: wait until they are drawn.
const HUBS = ["oversight", "oversight/hr-settings", "oversight/system"];

async function show(path: string) {
  const route = oversightRoutes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`no oversight route for ${path}`);
  const before = mounted.length;
  renderApp(<>{route.element}</>, { route: `/overview/${path}`, path: `/overview/${path}`, me: exec });
  if (!HUBS.includes(path)) await waitFor(() => expect(mounted.length).toBeGreaterThan(before));
}

function linksUnder(prefix: string): (string | null)[] {
  return screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith(prefix));
}

beforeEach(() => {
  mounted.length = 0;
});

describe("Oversight", () => {
  it("lists the four entries of the UI document and no action", () => {
    renderApp(<OversightIndexPage />, { route: "/overview/oversight", path: "/overview/oversight", me: exec });

    expect(screen.getByRole("heading", { level: 1, name: "Supervision" })).toBeInTheDocument();
    expect(screen.getByText("Tout ce qui suit est en consultation seule.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Journal d'activité/ })).toHaveAttribute("href", "/overview/oversight/activity");
    expect(screen.getByRole("link", { name: /^Journal de sécurité/ })).toHaveAttribute("href", "/overview/oversight/security");
    expect(screen.getByRole("link", { name: /^Réglages RH/ })).toHaveAttribute("href", "/overview/oversight/hr-settings");
    expect(screen.getByRole("link", { name: /^Comptes et système/ })).toHaveAttribute("href", "/overview/oversight/system");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lists the HR settings in the order of the HR index, and only those it can show", () => {
    renderApp(<OversightHubPage hub="hr-settings" />, { route: "/overview/oversight/hr-settings", path: "/overview/oversight/hr-settings", me: exec });

    expect(linksUnder("/overview/oversight/hr-settings/")).toEqual([
      "/overview/oversight/hr-settings/request-types",
      "/overview/oversight/hr-settings/departments",
    ]);
    expect(screen.getByRole("link", { name: /^Retour/ })).toHaveAttribute("href", "/overview/oversight");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lists the system pages an executive may read", () => {
    renderApp(<OversightHubPage hub="system" />, { route: "/overview/oversight/system", path: "/overview/oversight/system", me: exec });

    expect(linksUnder("/overview/oversight/system/")).toEqual([
      "/overview/oversight/system/status",
      "/overview/oversight/system/accounts",
      "/overview/oversight/system/parameters",
    ]);
  });

  it.each([
    ["oversight/activity", "ActivityLogPage", {}, "/overview/oversight"],
    ["oversight/security", "AuditLogPage", { category: "security" }, "/overview/oversight"],
    ["oversight/hr-settings/request-types", "RequestTypesPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/steps", "TypeStepsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/events", "EventsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/holidays", "HolidaysPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/parameters", "SettingsGroupPage", { group: "hr", readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/departments", "DepartmentsPositionsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/system/status", "StatusPage", { readOnly: true }, "/overview/oversight/system"],
    ["oversight/system/accounts", "AccountsPage", { readOnly: true }, "/overview/oversight/system"],
    ["oversight/system/parameters", "SettingsGroupPage", { group: "system", readOnly: true }, "/overview/oversight/system"],
  ])("%s mounts %s with a way back", async (path, page, props, back) => {
    await show(path);

    expect(mounted.at(-1)).toEqual({ page, props });
    expect(screen.getByRole("link", { name: "Retour à la supervision" })).toHaveAttribute("href", back);
  });

  it("mounts an account read-only and leaves the way back to the page itself", async () => {
    await show("oversight/system/accounts/:id");

    expect(mounted.at(-1)).toEqual({ page: "AccountPage", props: { readOnly: true } });
    expect(screen.queryByRole("link", { name: "Retour à la supervision" })).not.toBeInTheDocument();
  });

  it("mounts every page that has actions with readOnly, so that none is rendered", async () => {
    for (const route of oversightRoutes) {
      await show(route.path!);
      cleanup();
    }

    const withActions = mounted.filter((entry) => entry.page !== "AuditLogPage" && entry.page !== "ActivityLogPage");
    expect(withActions).toHaveLength(10);
    expect(withActions.every((entry) => entry.props.readOnly === true)).toBe(true);
    expect(oversightRoutes).toHaveLength(15);
  });
});
