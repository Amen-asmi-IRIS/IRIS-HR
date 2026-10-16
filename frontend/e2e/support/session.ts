import { type APIRequestContext, type Page, type TestInfo, expect, request as playwrightRequest } from "@playwright/test";

import { PASSWORD } from "../helpers";

/** The demo accounts (master 6.11). The journeys use them by name; the audits by role. */
export const USERS = {
  sysadmin: "sysadmin@impactrisks.com",
  ceo: "ceo@impactrisks.com",
  hr: "hr@impactrisks.com",
  manager: "manager.a@impactrisks.com",
  owner: "employee.a1@impactrisks.com",
  peer: "employee.a2@impactrisks.com",
  otherManager: "manager.b@impactrisks.com",
  outsider: "employee.b1@impactrisks.com",
} as const;

export type Persona = keyof typeof USERS;
export type Language = "fr" | "en";
type Method = "post" | "put" | "patch" | "delete";

/** The REST API with the CSRF token added, failing loudly on an unexpected status. */
export class Api {
  constructor(readonly context: APIRequestContext) {}

  private async token(): Promise<string> {
    const state = await this.context.storageState();
    return state.cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const response = await this.context.get(`/api/v1${path}`, { params });
    expect(response.status(), `GET ${path}: ${await response.text()}`).toBe(200);
    return response.json();
  }

  async send<T = unknown>(method: Method, path: string, data?: unknown): Promise<T> {
    const response = await this.context.fetch(`/api/v1${path}`, {
      method: method.toUpperCase(),
      headers: { "X-CSRFToken": await this.token() },
      data: data ?? {},
    });
    expect(response.status(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBeLessThan(300);
    return response.status() === 204 ? (undefined as T) : response.json();
  }

  /** Like `send`, but returns the status without asserting it. */
  async attempt(method: Method, path: string, data?: unknown): Promise<number> {
    const response = await this.context.fetch(`/api/v1${path}`, {
      method: method.toUpperCase(),
      headers: { "X-CSRFToken": await this.token() },
      data: data ?? {},
    });
    return response.status();
  }
}

async function login(context: APIRequestContext, email: string, password: string): Promise<Api> {
  const api = new Api(context);
  await context.get("/api/v1/auth/csrf");               // sets the csrftoken cookie: sign-in needs it too
  await api.send("post", "/auth/login", { email, password });
  return api;
}

/** Opens a session for a demo account in the browser's own context, without the Sign in page. */
export async function enterAs(page: Page, persona: Persona, language: Language = "fr"): Promise<Api> {
  const api = await login(page.context().request, USERS[persona], PASSWORD);
  await api.send("patch", "/auth/me", { language });
  return api;
}

/** The API with the session the page already has (after a sign-in through the page). */
export function apiOf(page: Page): Api {
  return new Api(page.context().request);
}

/** An API session with no browser, for preparing data. */
export async function apiAs(baseURL: string, persona: Persona): Promise<Api> {
  const context = await playwrightRequest.newContext({ baseURL, ignoreHTTPSErrors: true });
  return login(context, USERS[persona], PASSWORD);
}

/** Opens a page and waits until it has settled. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toBeVisible();
}

export function baseUrlOf(testInfo: TestInfo): string {
  return testInfo.project.use.baseURL ?? "http://127.0.0.1:5173";
}
