import { defineConfig, devices } from "@playwright/test";

// NFR-07: current Chrome, Edge and Firefox, on desktop and phone.
// One engine per run, chosen by E2E_BROWSER, because the journeys of a run share one database and take
// their dates from the project name ("desktop" or "phone"). Each run resets the database first.
const ENGINES = {
  chromium: { ...devices["Desktop Chrome"] },
  firefox: { ...devices["Desktop Firefox"] },
  edge: { ...devices["Desktop Edge"], channel: "msedge" },
} as const;

type Engine = keyof typeof ENGINES;
const engine = (process.env.E2E_BROWSER ?? "chromium") as Engine;
if (!(engine in ENGINES)) {
  throw new Error(`E2E_BROWSER must be one of: ${Object.keys(ENGINES).join(", ")}`);
}

// The journeys run against the development stack (docker compose up -d) and share one database,
// so they run one after the other.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // The development server compiles a page the first time it is opened. From a Windows folder mounted into its
  // container that first visit can take tens of seconds, so the limits are wide; a healthy run never reaches them.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    // The address, not the name: on Windows "localhost" is tried over IPv6 first, where the stack does not listen.
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: ENGINES[engine] },
    // A phone viewport is emulated by Chromium only (Chrome and Edge on Android are Chromium).
    // Firefox on a phone is checked by hand at the rehearsal.
    ...(engine === "chromium" ? [{ name: "phone", use: { ...devices["Pixel 7"] } }] : []),
  ],
});
