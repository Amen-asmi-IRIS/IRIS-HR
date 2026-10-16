# IRIS HR 01b: Foundation, Frontend and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the step 1 API a face and a way to reach the server: the React application with its shell, the sign-in pages and the Administration workspace, plus the proxy image, the pipeline and the server update command.

**Architecture:** a React single-page application talks to `/api/v1` through a client typed from `backend/openapi.yaml`. Pages are grouped in five role workspaces; a registry of routes decides which navigation entries exist, so later plans add pages without touching the shell. Caddy serves the built application over HTTPS and forwards `/api` to Django. GitHub Actions checks every push and publishes two images per version tag; one shell command on the server moves a stack to a version.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind CSS v4 (`@tailwindcss/vite`), Radix primitives in shadcn/ui form, TanStack Query v5, React Router v7, react-i18next, react-hook-form with zod, openapi-typescript, openapi-fetch, date-fns, lucide-react, Vitest, Testing Library, MSW v2, Playwright, ESLint (flat config), Node 24. Caddy 2. GitHub Actions and GitHub Container Registry. Bash for the server scripts.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (the binding contract of the plan set; read it first)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` sections 2, 3, 4, 9, 10.1, 10.4
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` sections 5.1, 5.6, 9.4, 10, 11 (NFR-06 to NFR-08), 12.2 to 12.5, 12.8
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`

**Depends on:** plan 01a (`2026-10-06-iris-hr-01a-foundation-backend.md`), complete and green. This plan consumes the endpoints and JSON shapes of master sections 7.1 to 7.5 as plan 01a implements them, and the points its contract notes 9, 10, 12, 13, 16, 19 and 21 to 25 address to this plan.

## Global Constraints

Master plan section 2 applies in full. The lines below are the ones this plan touches most, copied from the specs.

**From the UI document, section 2**

- U2: "Every request says in plain words where it stands, who it is waiting on, and what happens next."
- U3: "Plain language. An everyday word is used wherever one exists; internal codes and status names are never shown. One word means one thing everywhere."
- U5: "An error appears next to its cause, says what is wrong and what to do about it. What the user typed is never lost."
- U6: "Nothing irreversible happens without a confirmation that states the consequence."
- U7: "Every action is acknowledged, and the page shows the new state without a manual refresh."
- U8: "Every page works on a phone, with a keyboard alone and with a screen reader. Target: WCAG 2.1 AA."
- U9: "French and English are complete and equal. No screen mixes the two."
- M1: "One primary action per page. Every other action is visibly secondary."
- M2: "A workspace has at most six navigation entries."
- M3: "A home has at most four blocks, each answering a question that role asks every day. A block with nothing to show shrinks to one line or disappears."
- M4: "A list shows at most six attributes per item. The rest is inside the item."
- M5: "At most three filters are visible. Others are one step away."
- M6: "A detail page opens on a summary and the actions available. History, step-by-step detail and technical information are one step away."
- M8: "Nothing is shown that the user cannot use: no disabled menu entries, no greyed-out actions for another role, no empty columns."
- R1: "Each role has its own workspace, with its own home, navigation, primary action and vocabulary."
- R4: "A person with several roles switches workspace explicitly. Workspaces are never merged into one screen."

**From the UI document, sections 3 and 4**

- "A workspace switcher appears only for a person with more than one workspace."
- "The switcher shows, per workspace, how many things are waiting there."
- "After sign-in the user lands on the workspace they used last. On first sign-in they land on their most specific one, in this order: Administration, HR desk, Overview, My team, My space."
- "Opening a link or a notification switches to the workspace the item belongs to."
- "Environment marker: On the test stack only: a visible indication that this is not production."
- "Lists: Filterable, sortable, paged. Filters are kept when the user opens an item and comes back."
- "Empty lists: Say why they are empty and, where relevant, offer the action that would fill them."
- "Forms: Per-field errors from the server, translated. A failed submission keeps what was typed."
- "Not allowed: A page or item outside the user's reach shows 'not available', without revealing whether it exists."
- "Session end: After 2 hours of inactivity the user returns to Sign in and then to the page they were on."
- "Concurrent action: If someone else acted first, the user is told and sees the current state."
- "Wrong email or password: one message that does not say which."
- "There is no 'forgot password' link in the first build. The page says that the System Administrator resets passwords."
- Choose a new password: "Nothing else is reachable until it is done."
- After sign-in: "Shown once per sign-in: date and time of the previous sign-in. If the password was reset since then, by whom and when."
- Administration: "This workspace contains no business data: no requests, balances, documents or employee details beyond name and email."
- Create account: "The temporary password, shown once, with its expiry and a reminder to hand it over in person."

**From `docs/design/README.md`**

- "One primary button per page; no disabled controls — what a role can't use is not shown."
- "Statuses are sentences from the viewer's angle, with a coloured dot."
- "Logo cyan `#0AA2D0` is for the logo and graphics only; IRIS blue `#0070B0` carries text and buttons."
- "Every text/background pair meets WCAG 2.1 AA; touch targets are 44px on phone."
- "Focused tasks (decisions, HR actions, balance adjustment, departure, delegation) are drawn as a 480px right sheet — full screen on phone."

**From the design tokens** (`docs/design/iris-hr-design-tokens.json`)

- Control height 40px on desktop; minimum hit target 44px on a phone; table row at least 60px; table head 40px; sidebar 240px; sheet 480px; application maximum width 1440px; phone top bar 60px; phone tab bar 64px.
- The one big number is 48px, "40px on phone".
- Motion: 120ms for hover and focus, 200ms for popovers, 240ms for the sheet, a toast "stays 5 s".
- "Default: surfaces use borders, not shadows." The popover shadow is for "menus and popovers only".

**From the PRD, sections 9.4, 10 and 12**

- "API client and types generated from the OpenAPI description."
- "Server data through TanStack Query; routing through React Router; forms validated with a schema library and again on the server."
- "Authentication: server-side session in a cookie marked HttpOnly, Secure and SameSite=Lax, with CSRF protection. No tokens in browser storage."
- Transport: "HTTPS on the office network with a certificate for an internal hostname. HSTS enabled."
- Web: "CSRF protection, strict content-security policy, secure cookie flags, clickjacking protection."
- "`.env.example` is committed and documents every variable with a safe example value."
- "An update never writes to a `.env`. Before changing anything it compares the `.env` with the new `.env.example` and stops with the list of missing variables."
- Pipeline: "On every push and pull request: formatting and lint (Ruff, ESLint), type checks (`tsc`), backend tests against PostgreSQL, frontend tests, OpenAPI check, dependency vulnerability scan, image build." "On a version tag `vX.Y.Z`: the same checks, then the two images are published to GitHub's container registry under that tag."
- Server update, "One command, given a version": "1. Fetch that version's compose files and `.env.example`. 2. Check the `.env` (12.3). Stop if anything is missing. 3. Dump the database. 4. Pull the images for that version. 5. Apply database migrations. 6. Restart the containers. 7. Call `/health`. On failure, print the command to return to the previous version and the dump."
- "Shell scripts are stored with Unix line endings (`.gitattributes`), because development is on Windows and the server is Ubuntu."

**Fixed by this plan (layout, D23)**

- The frame is chosen by viewport width: below 768px the phone frame, otherwise the desktop frame. One frame is rendered at a time, never both.
- Every colour, size, radius and motion value in a class name comes from the tokens file. No hex value appears in a component.

## Review Focus

The five inputs or failure modes most likely to hurt a person in this plan's scope. Each has a test in the task named.

1. **The session ends while a page is open.** The next call answers 401. The user must reach Sign in, and after signing in be back on the same page with the same filters, not on the home (Task 15, `router.test.tsx`, "returns to the page, with its filters, after the session ended"; Task 24, `sign-in.spec.ts`, "returns to the page that was asked for, with its filters").
2. **A hostile `next` address on the sign-in page.** `?next=//evil.example`, `?next=https://evil.example` or `?next=/login` must never take the user out of the application or into a loop (Task 9, `guards.test.tsx`, the `safeNext` cases; Task 10, `SignInPage.test.tsx`, "ignores a next address that leaves the application").
3. **The temporary password leaks or is lost.** It must be visible once, never be written to browser storage or the address bar, and be gone once the administrator leaves the page (Task 17, `CreateAccountPage.test.tsx`, "shows the temporary password once and keeps it out of storage"; Task 19, `AccountPage.test.tsx`, "resets the password after a confirmation and shows the temporary one once").
4. **The application goes away mid-use.** During an upgrade the API answers 502 with an HTML page, or the network call fails. The user must see "being updated" or a clear message next to the form, keep what they typed, and never get a blank page (Task 2, `client.test.ts`, the two "unavailable" cases; Task 9, `guards.test.tsx`, "shows 'being updated' while the application is away, then carries on"; Task 10, "keeps what was typed when the application cannot be reached"; Task 21, the three "application is away" checks of `smoke.sh`).
5. **An update on a server whose `.env` is behind, or a version that does not start.** The update must stop before touching anything, name the missing variables, never write to `.env`, and on an unhealthy start print how to go back (Task 22, `check-env.test.sh`, and cases 3 and 6 of `update.test.sh`).

## File Structure

Everything is under the repository root, the project folder (master D1).

```
compose.dev.yaml                     + the web service (Task 1)
compose.server.yaml                  server overrides: registry images, proxy, restart policies (Task 21)
README.md                            developer guide (Task 25)
CHANGELOG.md                         one entry per version (Task 26)
.github/workflows/ci.yml             checks on every push and pull request (Task 23)
.github/workflows/release.yml        checks, then images, on a version tag (Task 23)
.github/scripts/make-env.sh          builds a throwaway .env for the pipeline, with its test (Task 23)
proxy/Dockerfile                     builds the frontend, then the Caddy image (Task 21)
proxy/Dockerfile.dockerignore
proxy/Caddyfile                      HTTPS, headers, /api, single-page fallback, maintenance page
proxy/tls.caddy                      the certificate line; internal authority by default
proxy/entrypoint.sh                  picks the internal authority or a supplied certificate
proxy/maintenance.html               the bilingual "being updated" page
proxy/certs/.gitignore               where a supplied certificate goes on the server
proxy/tests/smoke.sh                 builds and probes the proxy image
scripts/server/lib.sh                helpers shared by the server scripts (Task 22)
scripts/server/check-env.sh          compares .env with .env.example, never writes
scripts/server/dump.sh               encrypted database dump, written to the backup volume
scripts/server/update.sh             the seven steps of PRD 12.5
scripts/server/compose.sh            docker compose pinned to the deployed version
scripts/server/state/.gitignore      the deployed version is recorded in this folder
scripts/server/tests/*.test.sh       shell tests the pipeline runs
frontend/
  package.json, package-lock.json, index.html, vite.config.ts, tsconfig*.json, eslint.config.js, components.json, .gitignore
  playwright.config.ts
  e2e/                               global-setup.ts, helpers.ts, one spec per journey (Task 24)
  src/
    main.tsx                         entry: fonts, styles, text, providers, router
    app/
      workspaces.ts                  the five workspaces and their complete navigation
      homes.ts                       the home component of each workspace (extension point)
      sharedRoutes.tsx               routes inside the shell but outside a workspace (extension point)
      navigation.ts                  which entries and workspaces exist for a user; landing rule
      guards.tsx                     RequireAuth, RequirePasswordChange, RequireWorkspace, safeNext
      providers.tsx                  query client, 401 handler, toaster
      router.tsx                     the route tree
    api/
      schema.d.ts                    generated from backend/openapi.yaml
      client.ts                      openapi-fetch client: CSRF, language, 401
      problem.ts                     ProblemError, FieldProblem
      problemText.ts                 the sentence to show for any error
      types.ts                       shapes derived from the schema
      queryClient.ts                 TanStack Query defaults
    i18n/
      index.ts                       loads every locales/<lang>/<namespace>.json
      parity.test.ts                 French and English must have the same keys
      locales/fr|en/                 common, nav, errors, auth, shell, notifications, accounts, settings, audit
    styles/                          index.css, tokens.css (copy of docs/design/iris-hr-tokens.css)
    lib/                             utils.ts (cn), format.ts, dates.ts
    components/ui/                   primitives: button, input, textarea, label, native-select, switch, dropdown-menu, popover, sheet, alert-dialog
    components/                      the shared components of master 9.2, one file each, plus Block, PageLoading, filters, BeingUpdated and index.ts
    features/
      auth/                          api.ts, session.ts, passwordSchema.ts, AuthCard, SignInPage, ChooseNewPasswordPage, ChangePasswordPage, AfterSignInNotice
      shell/                         AppShell, WorkspaceSwitcher, NavList, UserMenu, LanguageSwitch, EnvironmentStrip, NoWorkspacePage, workspaceCounts.ts, useCurrentWorkspace.ts, useChangeLanguage.ts
      notifications/                 api.ts, NotificationsBell, NotificationsPage
      accounts/                      api.ts, StatusPage, AccountState, AccountsPage, createAccountForm.ts, SubjectFields, RolesField, TemporaryPassword, CreateAccountPage, AccountPage, RolesSheet
      settings/                      api.ts, settingValues.ts, SettingsGroupPage
      audit/                         api.ts, labels.ts, AuditLogPage, EventSheet
    workspaces/                      me|team|hr|overview|admin/routes.tsx
    test/                            setup.ts, viewport.ts, server.ts, handlers.ts, render.tsx, fixtures.ts
```

Commands are those of master section 5. Two reminders for this plan:

- In PowerShell an argument that starts with `@` must be quoted. Every `npm install` line below quotes scoped packages with single quotes, which also works in Bash.
- Frontend tests run in French (the test setup switches to `fr`), so tests look for French labels.

---

### Task 1: Frontend scaffold and the `web` service

**Files:**
- Modify: `compose.dev.yaml`
- Create: `frontend/package.json`, `frontend/.gitignore`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, `frontend/eslint.config.js`, `frontend/components.json`
- Create: `frontend/src/vite-env.d.ts`, `frontend/src/main.tsx`, `frontend/src/styles/index.css`, `frontend/src/styles/tokens.css`, `frontend/src/lib/utils.ts`
- Create: `frontend/src/assets/iris-logo.png`, `frontend/src/assets/iris-logo-white.png`
- Create: `frontend/src/test/setup.ts`, `frontend/src/test/viewport.ts`, `frontend/src/test/server.ts`, `frontend/src/test/handlers.ts`
- Test: `frontend/src/styles/tokens.test.ts`, `frontend/src/lib/utils.test.ts`

**Interfaces:**
- Consumes: `compose.dev.yaml` and the `app` service from plan 01a; `docs/design/iris-hr-tokens.css`; `docs/brand/iris-logo.png` and `docs/brand/iris-logo-white.png`, copied there by plan 01a.
- Produces:
  - Compose service `web` (Vite on port 5173, `/api` proxied to `http://app:8000`, `./backend` mounted read-only at `/backend`).
  - npm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `api:types`, `e2e`.
  - Import alias `@/` for `frontend/src/`.
  - `cn(...inputs: ClassValue[]): string` from `@/lib/utils`.
  - `server` (MSW) from `@/test/server`; `setPhoneViewport(phone: boolean): void` from `@/test/viewport`.

- [ ] **Step 1: Add the `web` service to the development stack**

Open `compose.dev.yaml`. Under the existing top-level `services:` key add this service, indented like its neighbours:

```yaml
  web:
    image: node:24-bookworm-slim
    working_dir: /app
    command: sh -c "npm ci && npm run dev"
    environment:
      VITE_PROXY_TARGET: http://app:8000
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - ./backend:/backend:ro
      - web_node_modules:/app/node_modules
```

The file from plan 01a has no top-level `volumes:` key. Add one at the end of the file:

```yaml
volumes:
  web_node_modules:
```

The named volume keeps Linux binaries out of the Windows folder. `./backend` is mounted so that `npm run api:types` can read `../backend/openapi.yaml` from inside the container. The service has no `depends_on`, so `docker compose run --rm web …` does not start the database.

- [ ] **Step 2: Write `frontend/package.json` and `frontend/.gitignore`**

`frontend/package.json`:

```json
{
  "name": "iris-hr-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "api:types": "openapi-typescript ../backend/openapi.yaml -o src/api/schema.d.ts",
    "e2e": "playwright test"
  }
}
```

`frontend/.gitignore`:

```
node_modules
dist
*.tsbuildinfo
playwright-report
test-results
.vite
```

- [ ] **Step 3: Install the dependencies**

Run each line from the repository root. They create `frontend/package-lock.json`, which pins every version.

```
docker compose run --rm web npm install react@19 react-dom@19 react-router@7 '@tanstack/react-query@5' i18next react-i18next react-hook-form '@hookform/resolvers' zod openapi-fetch date-fns lucide-react class-variance-authority clsx tailwind-merge '@fontsource/plus-jakarta-sans' '@radix-ui/react-slot' '@radix-ui/react-dialog' '@radix-ui/react-alert-dialog' '@radix-ui/react-dropdown-menu' '@radix-ui/react-popover' '@radix-ui/react-switch'
```

```
docker compose run --rm web npm install --save-dev typescript vite '@vitejs/plugin-react' tailwindcss@4 '@tailwindcss/vite@4' '@types/react@19' '@types/react-dom@19' '@types/node@24' vitest jsdom '@testing-library/react' '@testing-library/user-event' '@testing-library/jest-dom' msw@2 eslint '@eslint/js' typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y globals openapi-typescript '@playwright/test'
```

Expected: both end with `added N packages` and no `ERR!` line. `frontend/package-lock.json` now exists.

- [ ] **Step 4: Write the configuration files**

`frontend/index.html`:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>IRIS HR</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // The source is a Windows folder mounted into a Linux container: file events do not cross, so poll.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": { target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    // Nothing is inlined as a data: URI, so the content-security policy can stay strict.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
```

`frontend/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom", "node"]
  },
  "include": ["src"]
}
```

`frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "playwright.config.ts", "e2e"]
}
```

`frontend/eslint.config.js`:

```js
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results", "src/api/schema.d.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Every visible string comes from a translation file (U9).
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·", ":", "/", "(", ")", "*"] }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**", "e2e/**"],
    rules: { "react/jsx-no-literals": "off" },
  },
);
```

`frontend/components.json` (the primitives of this plan are written by hand in shadcn/ui form so that sizes match the tokens; this file lets a later plan add more with `npx shadcn@latest add <name>`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/components"
  },
  "iconLibrary": "lucide"
}
```

`frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: Write the test support files**

`frontend/src/test/viewport.ts`:

```ts
// jsdom has no matchMedia. This one answers "phone" or "desktop" on demand.
let phone = false;
const listeners = new Set<() => void>();

export function setPhoneViewport(value: boolean): void {
  phone = value;
  listeners.forEach((listener) => listener());
}

export function installViewport(): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const isPhoneQuery = query.includes("max-width");
    return {
      get matches() {
        return isPhoneQuery ? phone : !phone;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as () => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as () => void),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}
```

`frontend/src/test/handlers.ts`:

```ts
import { http, HttpResponse } from "msw";

// Answers every page needs, so a test only declares what it is about.
export const handlers = [
  http.get("/api/v1/auth/csrf", () => HttpResponse.json({ csrf_token: "test-csrf-token" })),
  http.get("/api/v1/health", () =>
    HttpResponse.json({ status: "ok", app: "ok", database: "ok", worker: "ok", version: "0.1.0", environment: "development" }),
  ),
  http.get("/api/v1/notifications/unread-count", () => HttpResponse.json({ count: 0 })),
  http.get("/api/v1/notifications", () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
];
```

`frontend/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

`frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import { installViewport, setPhoneViewport } from "./viewport";

installViewport();

// Radix menus and popovers need these in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  setPhoneViewport(false);
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

afterAll(() => server.close());
```

- [ ] **Step 6: Write the failing tests**

`frontend/src/styles/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

describe("design tokens", () => {
  it("carries the IRIS values unchanged from docs/design", () => {
    const css = read("./tokens.css");
    expect(css).toContain("--primary: #0070B0;");
    expect(css).toContain("--logo-cyan: #0AA2D0;");
    expect(css).toContain("--muted-foreground: #667085;");
    expect(css).toContain("@theme inline");
    expect(css).toContain("--shadow-focus: 0 0 0 3px var(--ring);");
  });

  it("is imported after Tailwind", () => {
    const css = read("./index.css");
    const tailwind = css.indexOf('@import "tailwindcss";');
    const tokens = css.indexOf('@import "./tokens.css";');
    expect(tailwind).toBeGreaterThanOrEqual(0);
    expect(tokens).toBeGreaterThan(tailwind);
  });

  it("puts no colour value of its own in index.css", () => {
    expect(read("./index.css")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

`frontend/src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names and drops falsy ones", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets a later Tailwind class win over an earlier one", () => {
    expect(cn("px-2 h-10", "px-4")).toBe("h-10 px-4");
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/styles src/lib`
Expected: FAIL. `tokens.test.ts` reports `ENOENT: no such file or directory … tokens.css`, and `utils.test.ts` reports `Failed to resolve import "./utils"`.

- [ ] **Step 8: Add the tokens, the styles, the logos and the entry**

Copy the tokens file byte for byte and the two logos. In PowerShell, from the repository root:

```powershell
Copy-Item docs/design/iris-hr-tokens.css frontend/src/styles/tokens.css
New-Item -ItemType Directory -Force frontend/src/assets | Out-Null
Copy-Item docs/brand/iris-logo.png frontend/src/assets/iris-logo.png
Copy-Item docs/brand/iris-logo-white.png frontend/src/assets/iris-logo-white.png
```

`frontend/src/styles/index.css`:

```css
@import "tailwindcss";
@import "./tokens.css";

@custom-variant dark (&:is(.dark *));

@theme {
  --animate-fade-in: fade-in 200ms cubic-bezier(0.2, 0, 0, 1);
  --animate-sheet-in: sheet-in 240ms cubic-bezier(0.2, 0, 0, 1);

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes sheet-in {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
}

@layer base {
  body {
    margin: 0;
    min-height: 100dvh;
    font-size: var(--text-body);
    line-height: var(--text-body--line-height);
    -webkit-font-smoothing: antialiased;
  }
}
```

`frontend/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`frontend/src/main.tsx` (replaced in Task 15 by the real entry):

```tsx
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <p className="p-6 text-title font-semibold text-primary">{document.title}</p>
  </StrictMode>,
);
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/styles src/lib`
Expected: PASS, 2 files, 5 tests.

- [ ] **Step 10: Check lint, types, build and the running server**

Run: `docker compose run --rm web npm run lint`
Expected: no output after the script header, exit code 0. If `react/jsx-no-literals` is reported as unknown, the installed `eslint-plugin-react` exports the rule under the same name; check that `plugins: { react, … }` is present in the same config object as the rule.

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0, no output.

Run: `docker compose run --rm web npm run build`
Expected: ends with `✓ built in …`, and `frontend/dist/assets/` contains `plus-jakarta-sans-latin-400-normal-….woff2` and its siblings for 500, 600 and 700 (the fonts are bundled, not fetched).

Run: `docker compose up -d web`, wait until `docker compose logs web` shows `Local:   http://localhost:5173/`, then open `http://localhost:5173`.
Expected: the words "IRIS HR" in IRIS blue, in Plus Jakarta Sans.

- [ ] **Step 11: Commit**

```bash
git add compose.dev.yaml frontend
git commit -m "chore(frontend): scaffold the React application and the web service"
```

---

### Task 2: API client, problems and generated types

**Files:**
- Create: `frontend/src/api/schema.d.ts` (generated), `frontend/src/api/problem.ts`, `frontend/src/api/problemText.ts`, `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, `frontend/src/api/queryClient.ts`
- Test: `frontend/src/api/client.test.ts`, `frontend/src/api/problem.test.ts`

**Interfaces:**
- Consumes: `backend/openapi.yaml` and `scripts/dev.ps1 openapi` from plan 01a (it regenerates the description, then runs `npm run api:types` in the `web` service); the problem format of master 6.2; the paths of master 7.1 to 7.5; `GET auth/csrf`, which sets the `csrftoken` cookie and returns `{csrf_token}` (plan 01a, contract note 10).
- Produces:
  - `api` (an openapi-fetch client over `paths`), `call<T>(promise): Promise<T>`, `setApiLanguage(lang: string): void`, `setUnauthorizedHandler(handler: () => void): void` from `@/api/client`.
  - `FieldProblem`, `ProblemError` (`status`, `code`, `detail`, `errors`, `requestId`, getter `unavailable`), `problemFromBody(status, body)`, `networkProblem()` from `@/api/problem`.
  - `problemText(error: unknown, t: TFunction): string` from `@/api/problemText` (uses the `errors` namespace created in Task 3).
  - Response types `Me`, `Account`, `AccountPage`, `AccountDetail`, `AccountCreated`, `TemporaryPassword`, `AuditEvent`, `AuditPage`, `Setting`, `Notification`, `NotificationPage`, `AdminStatus`, `Health`, request-body types `Credentials`, `MeChanges`, `PasswordChange`, `AccountCreate`, query types `AccountQuery`, `AuditQuery`, and `Role`, all from `@/api/types` and all derived from the generated schema.
  - `makeQueryClient(): QueryClient` from `@/api/queryClient`.

- [ ] **Step 1: Generate the types**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` is rewritten (unchanged if plan 01a is current) and `frontend/src/api/schema.d.ts` is created.

Then confirm the contract this plan relies on:

```
docker compose run --rm web node -e "const s=require('fs').readFileSync('src/api/schema.d.ts','utf8');for(const p of ['/api/v1/auth/csrf','/api/v1/auth/me','/api/v1/auth/login','/api/v1/accounts/{public_id}/reset-password','/api/v1/settings/system/{key}','/api/v1/audit/security/export','/api/v1/notifications/{id}/read','/api/v1/admin/status','/api/v1/health']){if(!s.includes(p))throw new Error('missing path '+p)}console.log('paths ok')"
```

Expected: `paths ok`. A missing path means plan 01a departs from master section 7; fix the backend route (the master is binding), regenerate, and do not adapt the frontend.

- [ ] **Step 2: Write the failing tests**

`frontend/src/api/problem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { networkProblem, problemFromBody, ProblemError } from "./problem";

describe("problemFromBody", () => {
  it("reads the problem-details format of the API", () => {
    const problem = problemFromBody(400, {
      type: "urn:iris-hr:problem:accounts.email_taken",
      title: "Bad Request",
      status: 400,
      code: "accounts.email_taken",
      detail: "Cette adresse est déjà utilisée.",
      errors: [{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }],
      request_id: "req-42",
    });
    expect(problem).toBeInstanceOf(ProblemError);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("accounts.email_taken");
    expect(problem.detail).toBe("Cette adresse est déjà utilisée.");
    expect(problem.errors).toEqual([{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }]);
    expect(problem.requestId).toBe("req-42");
    expect(problem.unavailable).toBe(false);
  });

  it("treats a gateway answer that is not a problem as 'unavailable'", () => {
    for (const status of [502, 503, 504]) {
      const problem = problemFromBody(status, "<html>Bad gateway</html>");
      expect(problem.code).toBe("core.unavailable");
      expect(problem.unavailable).toBe(true);
    }
  });

  it("falls back to 'unexpected' for anything else it cannot read", () => {
    const problem = problemFromBody(500, undefined);
    expect(problem.code).toBe("core.unexpected");
    expect(problem.errors).toEqual([]);
    expect(problem.unavailable).toBe(false);
  });

  it("ignores malformed entries in errors", () => {
    const problem = problemFromBody(400, { code: "x.y", detail: "d", errors: [null, { nope: 1 }, { code: "x.y", field: 3 }] });
    expect(problem.errors).toEqual([{ field: null, code: "x.y", detail: "", params: {} }]);
  });
});

describe("networkProblem", () => {
  it("has status 0 and counts as unavailable", () => {
    const problem = networkProblem();
    expect(problem.status).toBe(0);
    expect(problem.code).toBe("core.network");
    expect(problem.unavailable).toBe(true);
  });
});
```

`frontend/src/api/client.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { api, call, setApiLanguage, setUnauthorizedHandler } from "./client";
import { ProblemError } from "./problem";

const noContent = () => new HttpResponse(null, { status: 204 });

beforeEach(() => {
  document.cookie = "csrftoken=abc123; path=/";
  setApiLanguage("fr");
  setUnauthorizedHandler(() => {});
});

describe("api client", () => {
  it("sends the language and the CSRF token on an unsafe method", async () => {
    let seen: Headers | undefined;
    server.use(
      http.post("/api/v1/auth/logout", ({ request }) => {
        seen = request.headers;
        return noContent();
      }),
    );
    await call(api.POST("/api/v1/auth/logout"));
    expect(seen?.get("x-csrftoken")).toBe("abc123");
    expect(seen?.get("accept-language")).toBe("fr");
  });

  it("does not send the CSRF token on a read", async () => {
    let seen: Headers | undefined;
    server.use(
      http.get("/api/v1/notifications/unread-count", ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ count: 2 });
      }),
    );
    const body = await call(api.GET("/api/v1/notifications/unread-count"));
    expect(body.count).toBe(2);
    expect(seen?.get("x-csrftoken")).toBeNull();
  });

  it("asks for the CSRF cookie before the first unsafe call, sign-in included", async () => {
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    const order: string[] = [];
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/auth/csrf", () => {
        order.push("csrf");
        // The browser stores the cookie the API sets; the test does it by hand.
        document.cookie = "csrftoken=fresh; path=/";
        return HttpResponse.json({ csrf_token: "fresh" });
      }),
      http.post("/api/v1/auth/login", ({ request }) => {
        order.push("login");
        seen = request.headers.get("x-csrftoken");
        return HttpResponse.json({});
      }),
    );
    await call(api.POST("/api/v1/auth/login", { body: { email: "a@impactrisks.com", password: "x" } }));
    expect(order).toEqual(["csrf", "login"]);
    expect(seen).toBe("fresh");
  });

  it("falls back on the token in the answer when the cookie cannot be read", async () => {
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/auth/csrf", () => HttpResponse.json({ csrf_token: "from-the-answer" })),
      http.post("/api/v1/auth/logout", ({ request }) => {
        seen = request.headers.get("x-csrftoken");
        return noContent();
      }),
    );
    await call(api.POST("/api/v1/auth/logout"));
    expect(seen).toBe("from-the-answer");
  });

  it("throws a ProblemError carrying the fields", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json(
          {
            type: "urn:iris-hr:problem:auth.invalid_credentials",
            title: "Bad Request",
            status: 400,
            code: "auth.invalid_credentials",
            detail: "Adresse ou mot de passe incorrect.",
            errors: [{ field: null, code: "auth.invalid_credentials", detail: "Adresse ou mot de passe incorrect.", params: {} }],
            request_id: "req-1",
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const error = await call(api.POST("/api/v1/auth/login", { body: { email: "a@impactrisks.com", password: "x" } })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).code).toBe("auth.invalid_credentials");
    expect((error as ProblemError).requestId).toBe("req-1");
  });

  it("tells the application when a call answers 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get("/api/v1/notifications/unread-count", () =>
        HttpResponse.json({ code: "core.not_authenticated", detail: "Connectez-vous.", errors: [], request_id: "r" }, { status: 401 }),
      ),
    );
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect((error as ProblemError).status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("reports the application as unavailable when the proxy answers with a page", async () => {
    server.use(http.get("/api/v1/notifications/unread-count", () => new HttpResponse("<html>…</html>", { status: 503, headers: { "Content-Type": "text/html" } })));
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect((error as ProblemError).unavailable).toBe(true);
    expect((error as ProblemError).code).toBe("core.unavailable");
  });

  it("reports a failed connection as unavailable", async () => {
    server.use(http.get("/api/v1/notifications/unread-count", () => HttpResponse.error()));
    const error = await call(api.GET("/api/v1/notifications/unread-count")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).status).toBe(0);
    expect((error as ProblemError).unavailable).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/api`
Expected: FAIL with `Failed to resolve import "./problem"` and `Failed to resolve import "./client"`.

- [ ] **Step 4: Write the implementation**

`frontend/src/api/problem.ts`:

```ts
export interface FieldProblem {
  field: string | null;
  code: string;
  detail: string;
  params: Record<string, unknown>;
}

interface ProblemInit {
  status: number;
  code: string;
  detail: string;
  errors?: FieldProblem[];
  requestId?: string;
}

export class ProblemError extends Error {
  status: number;
  code: string;
  detail: string;
  errors: FieldProblem[];
  requestId: string;

  constructor(init: ProblemInit) {
    super(init.detail || init.code);
    this.name = "ProblemError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId ?? "";
  }

  /** The application is down, restarting or out of reach. */
  get unavailable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFieldProblem(value: unknown): FieldProblem | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  return {
    field: typeof value.field === "string" ? value.field : null,
    code: value.code,
    detail: typeof value.detail === "string" ? value.detail : "",
    params: isRecord(value.params) ? value.params : {},
  };
}

export function problemFromBody(status: number, body: unknown): ProblemError {
  if (isRecord(body) && typeof body.code === "string") {
    const errors = Array.isArray(body.errors)
      ? body.errors.map(toFieldProblem).filter((entry): entry is FieldProblem => entry !== null)
      : [];
    return new ProblemError({
      status,
      code: body.code,
      detail: typeof body.detail === "string" ? body.detail : "",
      errors,
      requestId: typeof body.request_id === "string" ? body.request_id : "",
    });
  }
  const code = status === 502 || status === 503 || status === 504 ? "core.unavailable" : "core.unexpected";
  return new ProblemError({ status, code, detail: "" });
}

export function networkProblem(): ProblemError {
  return new ProblemError({ status: 0, code: "core.network", detail: "" });
}
```

`frontend/src/api/problemText.ts`:

```ts
import type { TFunction } from "i18next";
import { ProblemError } from "./problem";

/** The sentence to show for any error: the server's own text when it sent one. */
export function problemText(error: unknown, t: TFunction): string {
  if (error instanceof ProblemError) {
    if (error.detail) return error.detail;
    if (error.status === 0) return t("errors:network");
    if (error.unavailable) return t("errors:unavailable");
  }
  return t("errors:unexpected");
}
```

`frontend/src/api/client.ts`:

```ts
import createClient, { type Middleware } from "openapi-fetch";
import { networkProblem, problemFromBody } from "./problem";
import type { paths } from "./schema";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let language = "fr";
let onUnauthorized: () => void = () => {};

export function setApiLanguage(lang: string): void {
  language = lang;
}

/** Called once for every call that answers 401, before the error is thrown. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

function readCookie(name: string): string | null {
  const row = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

/**
 * Django checks X-CSRFToken on every unsafe call, sign-in included. The cookie is set by GET auth/csrf,
 * which is asked the first time the cookie is missing.
 */
async function csrfToken(): Promise<string> {
  const fromCookie = readCookie("csrftoken");
  if (fromCookie) return fromCookie;
  let fromAnswer = "";
  try {
    const response = await fetch(`${window.location.origin}/api/v1/auth/csrf`, { credentials: "same-origin" });
    const body = (await response.json()) as { csrf_token?: string };
    fromAnswer = body.csrf_token ?? "";
  } catch {
    // Unreachable: the call that needs the token fails next and reports it.
  }
  return readCookie("csrftoken") ?? fromAnswer;
}

const headers: Middleware = {
  async onRequest({ request }) {
    request.headers.set("Accept-Language", language);
    if (UNSAFE_METHODS.has(request.method)) {
      request.headers.set("X-CSRFToken", await csrfToken());
    }
    return request;
  },
};

// The origin is spelled out so that the same code runs in the browser and under Node in tests.
export const api = createClient<paths>({ baseUrl: window.location.origin, credentials: "same-origin" });
api.use(headers);

/** Unwraps an openapi-fetch result: the body on success, a thrown ProblemError otherwise. */
export async function call<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await promise;
  } catch {
    throw networkProblem();
  }
  if (result.response.ok) return result.data as T;
  if (result.response.status === 401) onUnauthorized();
  throw problemFromBody(result.response.status, result.error);
}
```

`frontend/src/api/types.ts`:

```ts
import type { paths } from "./schema";

type JsonBody<R> = R extends { content: { "application/json": infer B } } ? B : never;
type Success<R> = R extends { 200: infer S } ? JsonBody<S> : R extends { 201: infer S } ? JsonBody<S> : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: infer R } ? Success<R> : never;
type Rows<Page> = Page extends { results?: infer R } ? (NonNullable<R> extends (infer Row)[] ? Row : never) : never;
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: infer B }
  ? NonNullable<B> extends { content: { "application/json": infer J } }
    ? J
    : never
  : never;

type Query<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

export type Role = "employee" | "manager" | "hr" | "exec" | "sysadmin";

export type AccountQuery = Query<"/api/v1/accounts", "get">;
export type AuditQuery = Query<"/api/v1/audit/security", "get">;

export type Credentials = Body<"/api/v1/auth/login", "post">;
export type MeChanges = Body<"/api/v1/auth/me", "patch">;
export type PasswordChange = Body<"/api/v1/auth/password", "post">;
export type AccountCreate = Body<"/api/v1/accounts", "post">;

export type Me = Ok<"/api/v1/auth/me", "get">;
export type Health = Ok<"/api/v1/health", "get">;
export type AdminStatus = Ok<"/api/v1/admin/status", "get">;

export type AccountPage = Ok<"/api/v1/accounts", "get">;
export type Account = Rows<AccountPage>;
export type AccountCreated = Ok<"/api/v1/accounts", "post">;
export type AccountDetail = Ok<"/api/v1/accounts/{public_id}", "get">;
export type TemporaryPassword = Ok<"/api/v1/accounts/{public_id}/reset-password", "post">;

export type AuditPage = Ok<"/api/v1/audit/security", "get">;
export type AuditEvent = Rows<AuditPage>;

export type Setting = Ok<"/api/v1/settings/system", "get">[number];

export type NotificationPage = Ok<"/api/v1/notifications", "get">;
export type Notification = Rows<NotificationPage>;
```

`frontend/src/api/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { ProblemError } from "./problem";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A refusal will not change by asking again; an outage might.
        retry: (failures, error) => !(error instanceof ProblemError && error.status >= 400 && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/api`
Expected: PASS, 2 files, 13 tests.

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0. If a type of `types.ts` resolves to `never`, open `src/api/schema.d.ts` and look at the response of that operation: the view in plan 01a is missing its `@extend_schema(responses=…)`. Add it in the backend and regenerate; do not cast in the frontend.

- [ ] **Step 6: Commit**

```bash
git add backend/openapi.yaml frontend/src/api
git commit -m "feat(frontend): typed API client with CSRF, language and problem errors"
```

---

### Task 3: Text, formats and dates

**Files:**
- Create: `frontend/src/i18n/index.ts`
- Create: `frontend/src/i18n/locales/fr/common.json`, `frontend/src/i18n/locales/en/common.json`, `frontend/src/i18n/locales/fr/nav.json`, `frontend/src/i18n/locales/en/nav.json`, `frontend/src/i18n/locales/fr/errors.json`, `frontend/src/i18n/locales/en/errors.json`
- Create: `frontend/src/lib/format.ts`, `frontend/src/lib/dates.ts`
- Modify: `frontend/src/test/setup.ts`
- Test: `frontend/src/i18n/parity.test.ts`, `frontend/src/i18n/index.test.ts`, `frontend/src/lib/format.test.ts`, `frontend/src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `setApiLanguage` from `@/api/client` (Task 2).
- Produces:
  - Default export `i18n`; `LANGUAGES`, `type Lang = "fr" | "en"`, `isLang(value): value is Lang`, `setLanguage(lang: Lang): Promise<void>`, `useLang(): Lang` from `@/i18n`.
  - Every file `src/i18n/locales/<lang>/<namespace>.json` is loaded automatically; a later plan adds a namespace by adding its two files, with no change to `index.ts`.
  - Namespaces `common`, `nav` (complete for the five workspaces) and `errors`.
  - `formatDate`, `formatDateRange`, `formatDateTime`, `formatDays`, `formatHours`, `formatNumber`, `formatBytes` from `@/lib/format`; each takes the value then the language.
  - `todayISO(now?: Date): string`, `addDaysISO(iso: string, days: number): string`, `isISODate(value: string): boolean` from `@/lib/dates`.
  - In tests a missing translation key throws `Missing translation <namespace>:<key>`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/i18n/parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

type Tree = { [key: string]: string | Tree };

const files = import.meta.glob<Tree>("./locales/*/*.json", { eager: true, import: "default" });

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

function load(): Record<string, Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, Record<string, string>>> = {};
  for (const [path, tree] of Object.entries(files)) {
    const match = /^\.\/locales\/([a-z]{2})\/([A-Za-z]+)\.json$/.exec(path);
    if (!match) throw new Error(`Unexpected translation file: ${path}`);
    out[match[1]] = { ...out[match[1]], [match[2]]: flatten(tree) };
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const all = load();
  const namespaces = Object.keys(all.fr ?? {}).sort();

  it("exist in French and English, and in nothing else", () => {
    expect(Object.keys(all).sort()).toEqual(["en", "fr"]);
  });

  it("have the same namespaces in both languages", () => {
    expect(Object.keys(all.en).sort()).toEqual(namespaces);
    expect(namespaces).toEqual(expect.arrayContaining(["common", "errors", "nav"]));
  });

  it.each(namespaces)("namespace %s has the same keys in both languages", (namespace) => {
    expect(Object.keys(all.en[namespace]).sort()).toEqual(Object.keys(all.fr[namespace]).sort());
  });

  it.each(namespaces)("namespace %s has no empty text and the same placeholders", (namespace) => {
    for (const [key, french] of Object.entries(all.fr[namespace])) {
      const english = all.en[namespace][key] ?? "";
      expect(french.trim(), `fr ${namespace}:${key}`).not.toBe("");
      expect(english.trim(), `en ${namespace}:${key}`).not.toBe("");
      expect(placeholders(english), `${namespace}:${key}`).toEqual(placeholders(french));
    }
  });

  it("names every workspace and navigation entry of the UI document", () => {
    const nav = all.en.nav;
    expect(nav["workspaces.me"]).toBe("My space");
    expect(nav["workspaces.team"]).toBe("My team");
    expect(nav["workspaces.hr"]).toBe("HR desk");
    expect(nav["workspaces.overview"]).toBe("Overview");
    expect(nav["workspaces.admin"]).toBe("Administration");
    expect(Object.keys(nav).filter((key) => key.startsWith("me."))).toHaveLength(5);
    expect(Object.keys(nav).filter((key) => key.startsWith("team."))).toHaveLength(6);
    expect(Object.keys(nav).filter((key) => key.startsWith("hr."))).toHaveLength(6);
    expect(Object.keys(nav).filter((key) => key.startsWith("overview."))).toHaveLength(6);
    expect(Object.keys(nav).filter((key) => key.startsWith("admin."))).toHaveLength(4);
  });
});
```

`frontend/src/i18n/index.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { api, call } from "@/api/client";
import { server } from "@/test/server";
import i18n, { isLang, setLanguage } from "./index";

describe("i18n", () => {
  it("starts each test in French", () => {
    expect(i18n.language).toBe("fr");
    expect(i18n.t("common:actions.save")).toBe("Enregistrer");
  });

  it("switches at once, marks the document and remembers the choice", async () => {
    await setLanguage("en");
    expect(i18n.t("common:actions.save")).toBe("Save");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("iris.language")).toBe("en");
  });

  it("tells the API which language to answer in", async () => {
    await setLanguage("en");
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/notifications/unread-count", ({ request }) => {
        seen = request.headers.get("accept-language");
        return HttpResponse.json({ count: 0 });
      }),
    );
    await call(api.GET("/api/v1/notifications/unread-count"));
    expect(seen).toBe("en");
  });

  it("knows only French and English", () => {
    expect(isLang("fr")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it("fails loudly in tests when a key does not exist", () => {
    expect(() => i18n.t("common:doesNotExist")).toThrow("Missing translation common:doesNotExist");
  });
});
```

`frontend/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDateRange, formatDateTime, formatDays, formatHours, formatNumber } from "./format";

// Intl may use non-breaking spaces; the tests compare with ordinary ones.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatDate", () => {
  it("writes a calendar date in the reader's language", () => {
    expect(plain(formatDate("2026-10-05", "fr"))).toBe("5 oct. 2026");
    expect(plain(formatDate("2026-10-05", "en"))).toBe("5 Oct 2026");
  });

  it("shows an instant on its Tunis date", () => {
    // 23:30 UTC is already the next day in Tunis (UTC+1).
    expect(plain(formatDate("2026-10-05T23:30:00Z", "fr"))).toBe("6 oct. 2026");
  });
});

describe("formatDateRange", () => {
  it("joins two dates, or shows one when they are the same", () => {
    expect(plain(formatDateRange("2026-11-03", "2026-11-05", "fr"))).toBe("3 nov. 2026 – 5 nov. 2026");
    expect(plain(formatDateRange("2026-11-03", "2026-11-03", "en"))).toBe("3 Nov 2026");
  });
});

describe("formatDateTime", () => {
  it("shows Tunis time on a 24-hour clock", () => {
    expect(plain(formatDateTime("2026-10-05T13:30:00Z", "fr"))).toBe("5 oct. 2026 à 14:30");
    expect(plain(formatDateTime("2026-10-05T13:30:00Z", "en"))).toBe("5 Oct 2026 at 14:30");
    expect(plain(formatDateTime("2026-10-05T23:05:00Z", "en"))).toBe("6 Oct 2026 at 00:05");
  });
});

describe("formatDays and formatHours", () => {
  it("allows halves and follows each language's plural", () => {
    expect(plain(formatDays("2.50", "fr"))).toBe("2,5 jours");
    expect(plain(formatDays("1.00", "fr"))).toBe("1 jour");
    expect(plain(formatDays("1.5", "fr"))).toBe("1,5 jour");
    expect(plain(formatDays(0.5, "en"))).toBe("0.5 days");
    expect(plain(formatDays(1, "en"))).toBe("1 day");
    expect(plain(formatDays("12", "en"))).toBe("12 days");
  });

  it("allows quarters of an hour", () => {
    expect(plain(formatHours("1.25", "fr"))).toBe("1,25 heure");
    expect(plain(formatHours("2.75", "en"))).toBe("2.75 hours");
  });
});

describe("formatNumber and formatBytes", () => {
  it("uses the language's decimal mark", () => {
    expect(plain(formatNumber(1234.5, "fr"))).toBe("1 234,5");
    expect(plain(formatNumber(1234.5, "en"))).toBe("1,234.5");
  });

  it("picks a readable unit", () => {
    expect(plain(formatBytes(512_000, "en"))).toBe("500 KB");
    expect(plain(formatBytes(13_002_342, "fr"))).toBe("12,4 Mo");
    expect(plain(formatBytes(3_221_225_472, "en"))).toBe("3 GB");
  });
});
```

`frontend/src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDaysISO, isISODate, todayISO } from "./dates";

describe("dates", () => {
  it("gives today's date in Tunis, not in UTC", () => {
    expect(todayISO(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
    expect(todayISO(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-06");
  });

  it("adds days across a month and a year", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("recognises a real calendar date only", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("28/02/2026")).toBe(false);
    expect(isISODate("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/i18n src/lib/format.test.ts src/lib/dates.test.ts`
Expected: FAIL with `Failed to resolve import "./index"`, `"./format"` and `"./dates"`; `parity.test.ts` fails on `expected [] to deeply equal [ 'en', 'fr' ]`.

- [ ] **Step 3: Write the translation files**

`frontend/src/i18n/locales/en/common.json`:

```json
{
  "appName": "IRIS HR",
  "skipToContent": "Skip to content",
  "saved": "Saved.",
  "concurrent": "Someone else acted first. The page now shows the current state.",
  "testEnvironment": "Test environment. This is not production.",
  "dateTime": "{{date}} at {{time}}",
  "dateRange": "{{start}} – {{end}}",
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "close": "Close",
    "back": "Back",
    "open": "Open",
    "edit": "Edit",
    "add": "Add",
    "remove": "Remove",
    "search": "Search",
    "export": "Export to Excel",
    "send": "Send",
    "retry": "Try again",
    "undo": "Undo",
    "copy": "Copy",
    "done": "Done"
  },
  "filters": {
    "label": "Filters",
    "more": "More filters",
    "fewer": "Fewer filters",
    "all": "All",
    "from": "From",
    "to": "To"
  },
  "list": {
    "loading": "Loading…",
    "pagination": "Pages",
    "page": "Page {{page}} of {{pages}}",
    "previous": "Previous page",
    "next": "Next page"
  },
  "state": {
    "yes": "Yes",
    "no": "No",
    "none": "None",
    "never": "Never"
  },
  "form": {
    "required": "This field is required.",
    "optional": "optional",
    "summaryTitle": "This could not be done:",
    "fileRemove": "Remove the file"
  },
  "units": {
    "day": { "one": "day", "other": "days" },
    "hour": { "one": "hour", "other": "hours" },
    "kb": "KB",
    "mb": "MB",
    "gb": "GB"
  },
  "language": {
    "label": "Language",
    "fr": "Français",
    "en": "English"
  },
  "roles": {
    "employee": "Employee",
    "manager": "Manager",
    "hr": "HR",
    "exec": "Executive Management",
    "sysadmin": "System Administrator"
  },
  "weekdays": {
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday"
  }
}
```

`frontend/src/i18n/locales/fr/common.json`:

```json
{
  "appName": "IRIS HR",
  "skipToContent": "Aller au contenu",
  "saved": "Enregistré.",
  "concurrent": "Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel.",
  "testEnvironment": "Environnement de test. Ceci n'est pas la production.",
  "dateTime": "{{date}} à {{time}}",
  "dateRange": "{{start}} – {{end}}",
  "actions": {
    "save": "Enregistrer",
    "cancel": "Annuler",
    "confirm": "Confirmer",
    "close": "Fermer",
    "back": "Retour",
    "open": "Ouvrir",
    "edit": "Modifier",
    "add": "Ajouter",
    "remove": "Retirer",
    "search": "Rechercher",
    "export": "Exporter vers Excel",
    "send": "Envoyer",
    "retry": "Réessayer",
    "undo": "Annuler l'action",
    "copy": "Copier",
    "done": "Terminé"
  },
  "filters": {
    "label": "Filtres",
    "more": "Plus de filtres",
    "fewer": "Moins de filtres",
    "all": "Tous",
    "from": "Du",
    "to": "Au"
  },
  "list": {
    "loading": "Chargement…",
    "pagination": "Pages",
    "page": "Page {{page}} sur {{pages}}",
    "previous": "Page précédente",
    "next": "Page suivante"
  },
  "state": {
    "yes": "Oui",
    "no": "Non",
    "none": "Aucun",
    "never": "Jamais"
  },
  "form": {
    "required": "Ce champ est obligatoire.",
    "optional": "facultatif",
    "summaryTitle": "Action impossible :",
    "fileRemove": "Retirer le fichier"
  },
  "units": {
    "day": { "one": "jour", "other": "jours" },
    "hour": { "one": "heure", "other": "heures" },
    "kb": "Ko",
    "mb": "Mo",
    "gb": "Go"
  },
  "language": {
    "label": "Langue",
    "fr": "Français",
    "en": "English"
  },
  "roles": {
    "employee": "Employé",
    "manager": "Responsable",
    "hr": "RH",
    "exec": "Direction générale",
    "sysadmin": "Administrateur système"
  },
  "weekdays": {
    "1": "Lundi",
    "2": "Mardi",
    "3": "Mercredi",
    "4": "Jeudi",
    "5": "Vendredi",
    "6": "Samedi",
    "7": "Dimanche"
  }
}
```

`frontend/src/i18n/locales/en/nav.json`:

```json
{
  "workspaces": {
    "me": "My space",
    "team": "My team",
    "hr": "HR desk",
    "overview": "Overview",
    "admin": "Administration"
  },
  "me": {
    "home": "Home",
    "requests": "Requests",
    "calendar": "Calendar",
    "balance": "Balance",
    "profile": "Profile"
  },
  "team": {
    "decide": "To decide",
    "people": "People",
    "requests": "Requests",
    "calendar": "Calendar",
    "delegations": "Delegations",
    "reports": "Reports"
  },
  "hr": {
    "desk": "Desk",
    "requests": "Requests",
    "employees": "Employees",
    "calendar": "Calendar",
    "reports": "Reports",
    "settings": "Settings"
  },
  "overview": {
    "home": "Overview",
    "people": "People",
    "requests": "Requests",
    "calendar": "Calendar",
    "reports": "Reports",
    "oversight": "Oversight"
  },
  "admin": {
    "status": "Status",
    "accounts": "Accounts",
    "parameters": "Parameters",
    "securityLog": "Security log"
  }
}
```

`frontend/src/i18n/locales/fr/nav.json`:

```json
{
  "workspaces": {
    "me": "Mon espace",
    "team": "Mon équipe",
    "hr": "Espace RH",
    "overview": "Vue d'ensemble",
    "admin": "Administration"
  },
  "me": {
    "home": "Accueil",
    "requests": "Demandes",
    "calendar": "Calendrier",
    "balance": "Solde",
    "profile": "Profil"
  },
  "team": {
    "decide": "À décider",
    "people": "Personnes",
    "requests": "Demandes",
    "calendar": "Calendrier",
    "delegations": "Délégations",
    "reports": "Rapports"
  },
  "hr": {
    "desk": "Bureau",
    "requests": "Demandes",
    "employees": "Employés",
    "calendar": "Calendrier",
    "reports": "Rapports",
    "settings": "Configuration"
  },
  "overview": {
    "home": "Vue d'ensemble",
    "people": "Personnes",
    "requests": "Demandes",
    "calendar": "Calendrier",
    "reports": "Rapports",
    "oversight": "Supervision"
  },
  "admin": {
    "status": "État",
    "accounts": "Comptes",
    "parameters": "Paramètres",
    "securityLog": "Journal de sécurité"
  }
}
```

`frontend/src/i18n/locales/en/errors.json`:

```json
{
  "unexpected": "Something went wrong. Please try again.",
  "network": "The application cannot be reached. Check your connection and try again.",
  "unavailable": "The application is being updated. It will be back shortly.",
  "notAvailable": {
    "title": "Not available",
    "body": "This page does not exist or is not available to you.",
    "back": "Back to the home page"
  },
  "wentWrong": {
    "title": "Something went wrong",
    "body": "The page could not be shown. If it happens again, give this reference to the System Administrator.",
    "reference": "Reference: {{id}}",
    "back": "Back to the home page"
  },
  "beingUpdated": {
    "title": "Being updated",
    "body": "The application is being updated and will be back shortly. This page checks again by itself."
  }
}
```

`frontend/src/i18n/locales/fr/errors.json`:

```json
{
  "unexpected": "Une erreur est survenue. Veuillez réessayer.",
  "network": "L'application est injoignable. Vérifiez votre connexion et réessayez.",
  "unavailable": "L'application est en cours de mise à jour. Elle sera de retour dans un instant.",
  "notAvailable": {
    "title": "Non disponible",
    "body": "Cette page n'existe pas ou ne vous est pas accessible.",
    "back": "Retour à l'accueil"
  },
  "wentWrong": {
    "title": "Une erreur est survenue",
    "body": "La page n'a pas pu être affichée. Si cela se reproduit, communiquez cette référence à l'administrateur système.",
    "reference": "Référence : {{id}}",
    "back": "Retour à l'accueil"
  },
  "beingUpdated": {
    "title": "Mise à jour en cours",
    "body": "L'application est en cours de mise à jour et sera de retour dans un instant. Cette page vérifie d'elle-même."
  }
}
```

- [ ] **Step 4: Write the implementation**

`frontend/src/i18n/index.ts`:

```ts
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { setApiLanguage } from "@/api/client";

export const LANGUAGES = ["fr", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];

const STORAGE_KEY = "iris.language";

export function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "en";
}

type Tree = { [key: string]: string | Tree };

// Every locales/<lang>/<namespace>.json is picked up; adding a feature never edits this file.
const files = import.meta.glob<Tree>("./locales/*/*.json", { eager: true, import: "default" });
const resources: Record<string, Record<string, Tree>> = {};
for (const [path, tree] of Object.entries(files)) {
  const match = /^\.\/locales\/([a-z]{2})\/([A-Za-z]+)\.json$/.exec(path);
  if (!match) continue;
  resources[match[1]] = { ...resources[match[1]], [match[2]]: tree };
}

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

function initialLanguage(): Lang {
  const saved = stored();
  if (isLang(saved)) return saved;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
}

function apply(lang: string): void {
  document.documentElement.lang = lang;
  setApiLanguage(lang);
}

// In tests a missing key is an error, so a typo cannot ship as a blank label.
const strict = import.meta.env.MODE === "test";

await i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: "fr",
  defaultNS: "common",
  ns: Object.keys(resources.fr ?? {}),
  interpolation: { escapeValue: false },
  saveMissing: strict,
  missingKeyHandler: strict
    ? (_languages, namespace, key) => {
        throw new Error(`Missing translation ${namespace}:${key}`);
      }
    : undefined,
});

apply(i18n.language);
i18n.on("languageChanged", (lang) => {
  apply(lang);
  remember(lang);
});

export async function setLanguage(lang: Lang): Promise<void> {
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/** The active language, re-rendering the caller when it changes. */
export function useLang(): Lang {
  const { i18n: instance } = useTranslation();
  return isLang(instance.language) ? instance.language : "fr";
}

export default i18n;
```

`frontend/src/lib/format.ts`:

```ts
import i18n, { type Lang } from "@/i18n";

const ZONE = "Africa/Tunis";
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

type DateInput = string | Date;

/** A plain YYYY-MM-DD is a calendar date and has no zone; anything else is an instant shown in Tunis time. */
function resolve(value: DateInput): { date: Date; zone: string } {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { date: new Date(Date.UTC(year, month - 1, day)), zone: "UTC" };
  }
  return { date: value instanceof Date ? value : new Date(value), zone: ZONE };
}

export function formatDate(value: DateInput, lang: Lang): string {
  const { date, zone } = resolve(value);
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(date);
}

export function formatDateRange(start: DateInput, end: DateInput, lang: Lang): string {
  const first = formatDate(start, lang);
  const last = formatDate(end, lang);
  return first === last ? first : i18n.t("common:dateRange", { lng: lang, start: first, end: last });
}

export function formatDateTime(value: DateInput, lang: Lang): string {
  const { date } = resolve(value);
  const time = new Intl.DateTimeFormat(LOCALES[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE }).format(date);
  return i18n.t("common:dateTime", { lng: lang, date: formatDate(date, lang), time });
}

export function formatNumber(value: number | string, lang: Lang, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits }).format(Number(value));
}

function withUnit(value: number | string, lang: Lang, unit: "day" | "hour"): string {
  const amount = Number(value);
  const form = new Intl.PluralRules(LOCALES[lang]).select(amount) === "one" ? "one" : "other";
  return `${formatNumber(amount, lang)} ${i18n.t(`common:units.${unit}.${form}`, { lng: lang })}`;
}

/** "2,5 jours" / "2.5 days". Days allow halves. */
export function formatDays(value: number | string, lang: Lang): string {
  return withUnit(value, lang, "day");
}

/** "1,25 heure" / "1.25 hours". Hours allow quarters. */
export function formatHours(value: number | string, lang: Lang): string {
  return withUnit(value, lang, "hour");
}

export function formatBytes(bytes: number, lang: Lang): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes >= GB) return `${formatNumber(bytes / GB, lang, 1)} ${i18n.t("common:units.gb", { lng: lang })}`;
  if (bytes >= MB) return `${formatNumber(bytes / MB, lang, 1)} ${i18n.t("common:units.mb", { lng: lang })}`;
  return `${formatNumber(bytes / KB, lang, 0)} ${i18n.t("common:units.kb", { lng: lang })}`;
}
```

`frontend/src/lib/dates.ts`:

```ts
import { addDays, format, parseISO } from "date-fns";

const ZONE = "Africa/Tunis";

/** Today's date in Tunis as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime());
}
```

- [ ] **Step 5: Make every test start in French**

In `frontend/src/test/setup.ts`, change the `vitest` import line and add the two marked blocks:

```ts
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import i18n from "@/i18n";
```

and, after the `beforeAll` line:

```ts
beforeEach(async () => {
  await i18n.changeLanguage("fr");
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/i18n src/lib`
Expected: PASS, 5 files. If a `format.test.ts` date assertion differs only in punctuation (for example `oct` without the full stop), the container's ICU data formats the short month differently: keep the implementation and correct the expected string in the test to what `Intl` prints.

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/i18n frontend/src/lib frontend/src/test/setup.ts
git commit -m "feat(frontend): French and English text, key parity test, formats and dates"
```

---

### Task 4: Interface primitives

**Files:**
- Create: `frontend/src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `native-select.tsx`, `switch.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `sheet.tsx`, `alert-dialog.tsx` (all in `frontend/src/components/ui/`)
- Test: `frontend/src/components/ui/ui.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 1); the utilities generated by `tokens.css` (`bg-primary`, `text-muted-foreground`, `rounded-md`, `shadow-popover`, `text-title`, …).
- Produces (named exports):
  - `Button` with `variant?: "primary" | "secondary" | "ghost" | "destructive" | "link"` (default `secondary`), `size?: "default" | "sm" | "icon" | "inline"`, `asChild?: boolean`; `type` defaults to `"button"`. `buttonVariants` for links styled as buttons.
  - `Input`, `Textarea`, `Label`, `NativeSelect` (a styled native `<select>`), `Switch`.
  - `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`.
  - `Popover`, `PopoverTrigger`, `PopoverContent`.
  - `Sheet`, `SheetContent` (needs `closeLabel: string`), `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetBody`, `SheetFooter`.
  - `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction`.
- Rule for every later task: a page has exactly one `variant="primary"` button; the default variant is secondary so that a second primary has to be asked for.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/ui/ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "./alert-dialog";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";
import { Switch } from "./switch";

describe("Button", () => {
  it("is secondary and does not submit unless told otherwise", () => {
    render(<Button>Ouvrir</Button>);
    const button = screen.getByRole("button", { name: "Ouvrir" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-secondary");
    expect(button).not.toHaveClass("bg-primary");
  });

  it("marks the primary action with the IRIS blue", () => {
    render(
      <Button variant="primary" type="submit">
        Envoyer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-primary", "text-primary-foreground");
  });

  it("is 44px high on a phone and 40px on a desktop", () => {
    render(<Button>Ouvrir</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-11", "md:h-10");
  });

  it("can dress a link as a button", () => {
    render(
      <Button asChild variant="primary">
        <a href="/admin/accounts/new">Créer un compte</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Créer un compte" });
    expect(link).toHaveClass("bg-primary");
    expect(link).not.toHaveAttribute("type");
  });
});

describe("form primitives", () => {
  it("pass their attributes through", () => {
    render(
      <>
        <Input aria-label="Nom" aria-invalid defaultValue="Sami" />
        <NativeSelect aria-label="État" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>
        <Switch aria-label="Actif" defaultChecked />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("combobox", { name: "État" })).toHaveValue("b");
    expect(screen.getByRole("switch", { name: "Actif" })).toBeChecked();
  });
});

describe("Sheet", () => {
  it("is a dialog named by its title, with a labelled close button", () => {
    render(
      <Sheet open>
        <SheetContent closeLabel="Fermer" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Nommer un délégué</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Nommer un délégué" });
    expect(dialog).toHaveClass("md:w-[480px]", "w-full");
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });
});

describe("AlertDialog", () => {
  it("asks before acting and runs the action once", async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Désactiver le compte ?</AlertDialogTitle>
          <AlertDialogDescription>La personne est déconnectée immédiatement.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole("alertdialog", { name: "Désactiver le compte ?" })).toHaveAccessibleDescription("La personne est déconnectée immédiatement.");
    await userEvent.click(screen.getByRole("button", { name: "Désactiver" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("DropdownMenu and Popover", () => {
  it("open from the keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onSelect}>Se déconnecter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger asChild>
            <Button>Notifications</Button>
          </PopoverTrigger>
          <PopoverContent aria-label="Dernières notifications">Rien de nouveau</PopoverContent>
        </Popover>
      </>,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("dialog", { name: "Dernières notifications" })).toHaveTextContent("Rien de nouveau");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/components/ui`
Expected: FAIL with `Failed to resolve import "./alert-dialog"`.

- [ ] **Step 3: Write the primitives**

`frontend/src/components/ui/button.tsx`:

```tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-body font-semibold transition-colors duration-[120ms] ease-standard [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-input bg-secondary text-secondary-foreground hover:bg-muted",
        ghost: "text-text-secondary hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 md:h-10",
        sm: "h-11 px-3 md:h-8",
        icon: "size-11 md:size-10",
        inline: "h-auto p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) return <Slot className={classes} {...props} />;
  return <button type={type ?? "button"} className={classes} {...props} />;
}
```

`frontend/src/components/ui/input.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-body text-foreground placeholder:text-muted-foreground read-only:bg-muted md:h-10",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    />
  );
}
```

`frontend/src/components/ui/textarea.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    />
  );
}
```

`frontend/src/components/ui/label.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  // The caller passes htmlFor; the lint rule cannot see it through the spread.
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <label className={cn("text-body font-medium text-foreground", className)} {...props} />;
}
```

`frontend/src/components/ui/native-select.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The browser's own select: it works with a keyboard, a screen reader and a phone without extra code. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-body text-foreground md:h-10",
        "aria-invalid:border-[var(--error-input)] aria-invalid:focus-visible:shadow-focus-error",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
```

`frontend/src/components/ui/switch.tsx`:

```tsx
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors duration-[120ms] ease-standard data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-card transition-transform duration-[120ms] ease-standard data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
```

`frontend/src/components/ui/dropdown-menu.tsx`:

```tsx
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-popover animate-fade-in", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-body outline-none data-[highlighted]:bg-accent md:min-h-10 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn("px-3 py-2 text-caption font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-divider", className)} {...props} />;
}
```

`frontend/src/components/ui/popover.tsx`:

```tsx
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-[min(360px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-popover animate-fade-in", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
```

`frontend/src/components/ui/sheet.tsx`:

```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/** The 480px right sheet for a focused task; it fills the screen on a phone. */
export function SheetContent({ className, children, closeLabel, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] animate-fade-in" />
      <DialogPrimitive.Content
        className={cn("fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card animate-sheet-in md:w-[480px] md:border-l md:border-border", className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-4 top-4 inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:size-10"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 border-b border-divider px-6 py-5 pr-16", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-dialog font-semibold text-foreground", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-body text-muted-foreground", className)} {...props} />;
}

export function SheetBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-3 border-t border-divider px-6 py-4 md:flex-row md:justify-end", className)} {...props} />;
}
```

`frontend/src/components/ui/alert-dialog.tsx`:

```tsx
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] animate-fade-in" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-border bg-card p-6 animate-fade-in",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-dialog font-semibold text-foreground", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-body text-text-secondary", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-3 flex flex-col-reverse gap-3 md:flex-row md:justify-end", className)} {...props} />;
}

export function AlertDialogCancel({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "secondary" }), className)} {...props} />;
}

export function AlertDialogAction({ className, destructive = false, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action> & { destructive?: boolean }) {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant: destructive ? "destructive" : "primary" }), className)} {...props} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/components/ui`
Expected: PASS, 1 file, 8 tests.

If the keyboard test cannot find the menu item, the installed Radix version opens the menu on `ArrowDown` only: replace `await user.keyboard("{Enter}")` with `await user.keyboard("{ArrowDown}")` in the test. If jsdom reports `PointerEvent is not defined`, add this to `src/test/setup.ts` under the other stubs:

```ts
class PointerEventStub extends MouseEvent {
  pointerId = 1;
  pointerType = "mouse";
}
globalThis.PointerEvent ??= PointerEventStub as unknown as typeof PointerEvent;
```

- [ ] **Step 5: Check lint and types, then commit**

Run: `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck`
Expected: both exit with code 0.

```bash
git add frontend/src/components/ui frontend/src/test/setup.ts
git commit -m "feat(frontend): interface primitives sized and coloured from the tokens"
```

---

### Task 5: Shared display components and the toast

**Files:**
- Create: `frontend/src/components/PageHeader.tsx`, `EmptyState.tsx`, `StatusBadge.tsx`, `Disclosure.tsx`, `Figure.tsx`, `PageLoading.tsx`, `toast.tsx` (all in `frontend/src/components/`)
- Modify: `frontend/src/test/setup.ts`
- Test: `frontend/src/components/display.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 4); `common` texts (Task 3); `Link` and `To` from `react-router`.
- Produces (named exports, one file per component):
  - `PageHeader({ title: string; primary?: ReactNode; back?: To; children?: ReactNode })`: the page's `h1`, its one primary action, an optional back link, an optional line under the title. Sets `document.title` to `<title> · IRIS HR`.
  - `EmptyState({ title: string; hint?: string; action?: ReactNode })`.
  - `StatusBadge({ tone: "waiting" | "approved" | "refused" | "info" | "neutral"; children: ReactNode })`; type `StatusTone`.
  - `Disclosure({ title: string; children: ReactNode; defaultOpen?: boolean })`: a "one step away" block. Its children are mounted only while it is open, so a closed block loads nothing.
  - `Figure({ label: string; value: ReactNode; hint?: ReactNode })`.
  - `PageLoading()`.
  - `toast(message: string, options?: { undo?: () => void }): void`, `Toaster()`, `clearToasts(): void`.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/display.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Disclosure } from "./Disclosure";
import { EmptyState } from "./EmptyState";
import { Figure } from "./Figure";
import { PageHeader } from "./PageHeader";
import { PageLoading } from "./PageLoading";
import { StatusBadge } from "./StatusBadge";
import { toast, Toaster } from "./toast";

describe("PageHeader", () => {
  it("shows the title as the page heading and in the tab", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Comptes" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Comptes" })).toBeInTheDocument();
    expect(document.title).toBe("Comptes · IRIS HR");
  });

  it("shows the primary action, a way back and a line under the title", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Sami Ben Ali" back="/admin/accounts" primary={<Button variant="primary">Réinitialiser le mot de passe</Button>}>
          <p>sami.benali@impactrisks.com</p>
        </PageHeader>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
    expect(screen.getByRole("button", { name: "Réinitialiser le mot de passe" })).toBeInTheDocument();
    expect(screen.getByText("sami.benali@impactrisks.com")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("says why the list is empty and offers the action that fills it", () => {
    render(<EmptyState title="Aucun compte" hint="Créez le premier compte." action={<Button>Créer un compte</Button>} />);
    expect(screen.getByText("Aucun compte")).toBeInTheDocument();
    expect(screen.getByText("Créez le premier compte.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer un compte" })).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("shows a sentence with a dot in the tone's colours", () => {
    render(<StatusBadge tone="waiting">En attente de première connexion</StatusBadge>);
    const badge = screen.getByText("En attente de première connexion");
    expect(badge).toHaveClass("bg-waiting-bg", "text-waiting");
    expect(badge.querySelector("[aria-hidden='true']")).toHaveClass("bg-waiting-dot");
  });
});

describe("Disclosure", () => {
  it("is closed until asked for, and mounts its content only then", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Historique">
        <p>Compte créé</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Historique" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Compte créé")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Compte créé")).toBeVisible();
  });
});

describe("Figure and PageLoading", () => {
  it("show the one number of a page with its label", () => {
    render(<Figure label="Solde" value="12,5" hint="jours" />);
    expect(screen.getByText("Solde")).toBeInTheDocument();
    expect(screen.getByText("12,5")).toHaveAttribute("data-figure");
    expect(screen.getByText("jours")).toBeInTheDocument();
  });

  it("say that the page is loading", () => {
    render(<PageLoading />);
    expect(screen.getByText("Chargement…")).toHaveAttribute("aria-busy", "true");
  });
});

describe("toast", () => {
  afterEach(() => vi.useRealTimers());

  it("acknowledges an action and leaves after five seconds", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => toast("Enregistré."));
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré.");
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré.");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("offers to undo where that is possible", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => toast("Brouillon supprimé.", { undo }));
    await userEvent.click(screen.getByRole("button", { name: "Annuler l'action" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/components/display.test.tsx`
Expected: FAIL with `Failed to resolve import "./Disclosure"`.

- [ ] **Step 3: Write the components**

`frontend/src/components/PageHeader.tsx`:

```tsx
import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, type To } from "react-router";

interface PageHeaderProps {
  title: string;
  /** The page's one primary action. */
  primary?: ReactNode;
  back?: To;
  /** A short line under the title. */
  children?: ReactNode;
}

export function PageHeader({ title, primary, back, children }: PageHeaderProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("appName")}`;
  }, [title, t]);

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {back !== undefined && (
          <Link to={back} className="mb-2 inline-flex min-h-11 items-center gap-2 text-body font-medium text-primary hover:underline md:min-h-0">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("actions.back")}
          </Link>
        )}
        <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
        {children && <div className="mt-1 text-body text-text-secondary">{children}</div>}
      </div>
      {primary && <div className="shrink-0">{primary}</div>}
    </header>
  );
}
```

`frontend/src/components/EmptyState.tsx`:

```tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Why the list is empty. */
  title: string;
  hint?: string;
  /** The action that would fill it. */
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card px-6 py-8">
      <p className="text-section font-semibold text-foreground">{title}</p>
      {hint && <p className="text-body text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

`frontend/src/components/StatusBadge.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "waiting" | "approved" | "refused" | "info" | "neutral";

const TONES: Record<StatusTone, { badge: string; dot: string }> = {
  waiting: { badge: "bg-waiting-bg text-waiting", dot: "bg-waiting-dot" },
  approved: { badge: "bg-approved-bg text-approved", dot: "bg-approved-dot" },
  refused: { badge: "bg-refused-bg text-refused", dot: "bg-refused-dot" },
  info: { badge: "bg-info-bg text-info", dot: "bg-info-dot" },
  neutral: { badge: "bg-neutral-bg text-neutral", dot: "bg-neutral-dot" },
};

/** A status is a sentence with a coloured dot, never a code. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-caption font-medium", TONES[tone].badge)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", TONES[tone].dot)} />
      {children}
    </span>
  );
}
```

`frontend/src/components/Disclosure.tsx`:

```tsx
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DisclosureProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Content that is "one step away". Children are mounted only while open. */
export function Disclosure({ title, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-t border-divider">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-section font-semibold text-foreground"
        >
          {title}
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard", open && "rotate-180")} />
        </button>
      </h2>
      <div id={id} hidden={!open} className="pb-4">
        {open ? children : null}
      </div>
    </section>
  );
}
```

`frontend/src/components/Figure.tsx`:

```tsx
import type { ReactNode } from "react";

interface FigureProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** The figure a person came for, shown first and alone. */
export function Figure({ label, value, hint }: FigureProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-2">
        <span data-figure className="text-[40px] leading-[40px] font-bold tracking-[-0.03em] text-foreground md:text-figure">
          {value}
        </span>
        {hint && <span className="text-body text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}
```

`frontend/src/components/PageLoading.tsx`:

```tsx
import { useTranslation } from "react-i18next";

export function PageLoading() {
  const { t } = useTranslation();
  return (
    <p aria-live="polite" aria-busy="true" className="py-6 text-body text-muted-foreground">
      {t("list.loading")}
    </p>
  );
}
```

`frontend/src/components/toast.tsx`:

```tsx
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

const STAY_MS = 5000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismiss(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Acknowledges an action. With `undo`, offers to take it back for five seconds. */
export function toast(message: string, options: { undo?: () => void } = {}): void {
  const id = nextId++;
  items = [...items, { id, message, undo: options.undo }];
  emit();
  setTimeout(() => dismiss(id), STAY_MS);
}

export function clearToasts(): void {
  items = [];
  emit();
}

export function Toaster() {
  const { t } = useTranslation();
  const current = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {current.map((item) => (
        <div key={item.id} className="pointer-events-auto flex items-center gap-4 rounded-lg bg-[var(--toast)] px-4 py-3 text-body text-background shadow-popover animate-fade-in">
          <span>{item.message}</span>
          {item.undo && (
            <button
              type="button"
              className="cursor-pointer font-semibold underline underline-offset-4"
              onClick={() => {
                item.undo?.();
                dismiss(item.id);
              }}
            >
              {t("actions.undo")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Clear toasts between tests**

In `frontend/src/test/setup.ts` add the import and one line inside the existing `afterEach`:

```ts
import { clearToasts } from "@/components/toast";
```

```ts
  clearToasts();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/components/display.test.tsx`
Expected: PASS, 1 file, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components frontend/src/test/setup.ts
git commit -m "feat(frontend): page header, empty state, status badge, disclosure, figure and toast"
```

---

### Task 6: Shared list components

**Files:**
- Create: `frontend/src/components/useIsPhone.ts`, `DataTable.tsx`, `Pager.tsx`, `FilterBar.tsx`, `filters.tsx`, `useListParams.ts` (all in `frontend/src/components/`)
- Test: `frontend/src/components/lists.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `NativeSelect`, `Label` (Task 4); `PageLoading` (Task 5); `setPhoneViewport` (Task 1).
- Produces:
  - `useIsPhone(): boolean`: true below 768px. The shell and `DataTable` render one layout from it; components never render both and hide one with CSS.
  - `DataTable<T>({ columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowOpen?: (row: T) => void; empty: ReactNode; isLoading?: boolean; label?: string })` with `Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; align?: "start" | "end" }`. At most six columns (throws otherwise). The first column's cell must be plain text: with `onRowOpen` it becomes the button that opens the row. On a phone the rows become cards.
  - `Pager({ page: number; pageSize: number; total: number; onPage: (page: number) => void })`: renders nothing for a single page; never shows a disabled button.
  - `FilterBar({ children: ReactNode; more?: ReactNode })`: at most three children (throws otherwise); `more` sits behind "More filters".
  - `FilterText({ label, value, onChange, type? })`, `FilterSelect({ label, value, onChange, options })`, `FilterDateRange({ label, from, to, onFrom, onTo })` from `@/components/filters`: labelled controls for a `FilterBar`, not bound to a form.
  - `useListParams<F extends Record<string, string>>(defaults: F)` returning `{ filters: F; page: number; sort: string; query: Record<string, string | number>; setFilter(key, value); setPage(page); setSort(sort) }`. State lives in the URL (`page`, `ordering` and one parameter per filter); a filter equal to its default is left out. `query` is ready to pass to the API.
  - `backToList(path: string): string`: the list address with the filters it last had, for the back link of a detail page.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/lists.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { setPhoneViewport } from "@/test/viewport";
import { DataTable, type Column } from "./DataTable";
import { FilterBar } from "./FilterBar";
import { FilterDateRange, FilterSelect, FilterText } from "./filters";
import { Pager } from "./Pager";
import { backToList, useListParams } from "./useListParams";

interface Row {
  id: string;
  name: string;
  email: string;
}

const rows: Row[] = [
  { id: "1", name: "Sami Ben Ali", email: "sami@impactrisks.com" },
  { id: "2", name: "Leila Trabelsi", email: "leila@impactrisks.com" },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Nom", cell: (row) => row.name },
  { key: "email", header: "Adresse", cell: (row) => row.email },
];

describe("DataTable", () => {
  it("shows a table whose first column opens the row", async () => {
    const onRowOpen = vi.fn();
    render(<DataTable label="Comptes" columns={columns} rows={rows} rowKey={(row) => row.id} onRowOpen={onRowOpen} empty={<p>Vide</p>} />);
    const table = screen.getByRole("table", { name: "Comptes" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Nom", "Adresse"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    await userEvent.click(within(table).getByRole("button", { name: "Leila Trabelsi" }));
    expect(onRowOpen).toHaveBeenCalledWith(rows[1]);
  });

  it("becomes a list of cards on a phone", () => {
    setPhoneViewport(true);
    render(<DataTable label="Comptes" columns={columns} rows={rows} rowKey={(row) => row.id} empty={<p>Vide</p>} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Comptes" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Adresse")).toBeInTheDocument();
    expect(within(items[0]).getByText("sami@impactrisks.com")).toBeInTheDocument();
  });

  it("explains an empty list and shows when it is loading", () => {
    const { rerender } = render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} empty={<p>Aucun compte</p>} />);
    expect(screen.getByText("Aucun compte")).toBeInTheDocument();
    rerender(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} empty={<p>Aucun compte</p>} isLoading />);
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Aucun compte")).not.toBeInTheDocument();
  });

  it("refuses a seventh attribute", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seven = Array.from({ length: 7 }, (_, index) => ({ key: `c${index}`, header: `C${index}`, cell: (row: Row) => row.name }));
    expect(() => render(<DataTable columns={seven} rows={rows} rowKey={(row) => row.id} empty={null} />)).toThrow(/at most six/);
  });
});

describe("Pager", () => {
  it("shows nothing when everything fits on one page", () => {
    const { container } = render(<Pager page={1} pageSize={25} total={25} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("moves between pages without ever showing a disabled button", async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pager page={1} pageSize={25} total={80} onPage={onPage} />);
    expect(screen.getByText("Page 1 sur 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page précédente" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(onPage).toHaveBeenCalledWith(2);

    rerender(<Pager page={4} pageSize={25} total={80} onPage={onPage} />);
    expect(screen.queryByRole("button", { name: "Page suivante" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Page précédente" }));
    expect(onPage).toHaveBeenCalledWith(3);
  });
});

describe("FilterBar", () => {
  it("keeps extra filters one step away", async () => {
    const user = userEvent.setup();
    render(
      <FilterBar more={<FilterText label="Adresse réseau" value="" onChange={() => {}} />}>
        <FilterText label="Recherche" value="" onChange={() => {}} />
        <FilterSelect label="État" value="" onChange={() => {}} options={[{ value: "", label: "Tous" }, { value: "locked", label: "Verrouillé" }]} />
        <FilterDateRange label="Période" from="" to="" onFrom={() => {}} onTo={() => {}} />
      </FilterBar>,
    );
    expect(screen.getByRole("search", { name: "Filtres" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Recherche" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "État" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Période" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse réseau")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));
    expect(screen.getByLabelText("Adresse réseau")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Moins de filtres" })).toHaveAttribute("aria-expanded", "true");
  });

  it("refuses a fourth visible filter", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = (label: string) => <FilterText key={label} label={label} value="" onChange={() => {}} />;
    expect(() => render(<FilterBar>{[filter("A"), filter("B"), filter("C"), filter("D")]}</FilterBar>)).toThrow(/At most three/);
  });
});

function ListProbe() {
  const list = useListParams({ search: "", state: "active" });
  const location = useLocation();
  return (
    <div>
      <p data-testid="url">{location.pathname + location.search}</p>
      <p data-testid="query">{JSON.stringify(list.query)}</p>
      <button onClick={() => list.setFilter("search", "sami")}>search</button>
      <button onClick={() => list.setFilter("state", "locked")}>locked</button>
      <button onClick={() => list.setFilter("state", "active")}>active</button>
      <button onClick={() => list.setPage(3)}>page 3</button>
      <button onClick={() => list.setSort("-last_login_at")}>sort</button>
    </div>
  );
}

describe("useListParams", () => {
  it("keeps filters, sort and page in the address", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin/accounts?page=2"]}>
        <ListProbe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("query")).toHaveTextContent('{"page":2,"state":"active"}');

    await user.click(screen.getByRole("button", { name: "search" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami");
    expect(screen.getByTestId("query")).toHaveTextContent('{"page":1,"search":"sami","state":"active"}');

    await user.click(screen.getByRole("button", { name: "locked" }));
    await user.click(screen.getByRole("button", { name: "page 3" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami&state=locked&page=3");

    await user.click(screen.getByRole("button", { name: "active" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/accounts?search=sami");

    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByTestId("query")).toHaveTextContent('"ordering":"-last_login_at"');
  });

  it("remembers the filters of a list for the way back", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/accounts?state=locked"]}>
        <ListProbe />
      </MemoryRouter>,
    );
    expect(backToList("/admin/accounts")).toBe("/admin/accounts?state=locked");
    expect(backToList("/admin/elsewhere")).toBe("/admin/elsewhere");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/components/lists.test.tsx`
Expected: FAIL with `Failed to resolve import "./DataTable"`.

- [ ] **Step 3: Write the components**

`frontend/src/components/useIsPhone.ts`:

```ts
import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True below 768px. One layout is rendered at a time, chosen by this. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
```

`frontend/src/components/DataTable.tsx`:

```tsx
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageLoading } from "./PageLoading";
import { useIsPhone } from "./useIsPhone";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the first column becomes the button that opens the row; its cell must be plain text. */
  onRowOpen?: (row: T) => void;
  /** What to show when there is no row: why, and the action that would fill the list. */
  empty: ReactNode;
  isLoading?: boolean;
  /** Accessible name of the table. */
  label?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowOpen, empty, isLoading = false, label }: DataTableProps<T>) {
  const phone = useIsPhone();
  if (columns.length > 6) throw new Error("A list shows at most six attributes per item (UI rule M4).");
  if (isLoading) return <PageLoading />;
  if (rows.length === 0 || columns.length === 0) return <>{empty}</>;

  const [first, ...others] = columns;
  const lead = (row: T) =>
    onRowOpen ? (
      <button type="button" onClick={() => onRowOpen(row)} className="cursor-pointer text-left font-semibold text-primary hover:underline">
        {first.cell(row)}
      </button>
    ) : (
      <span className="font-semibold text-foreground">{first.cell(row)}</span>
    );

  if (phone) {
    return (
      <ul aria-label={label} className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl border border-border bg-card p-4">
            <div className="flex min-h-11 items-center text-body">{lead(row)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
              {others.map((column) => (
                <Fragment key={column.key}>
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className="m-0 text-right text-foreground">{column.cell(row)}</dd>
                </Fragment>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table aria-label={label} className="w-full border-collapse text-body">
        <thead>
          <tr className="h-10 bg-muted text-caption font-medium text-muted-foreground">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn("px-4 font-medium", column.align === "end" ? "text-right" : "text-left")}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-15 border-t border-divider hover:bg-muted">
              <td className="px-4">{lead(row)}</td>
              {others.map((column) => (
                <td key={column.key} className={cn("px-4 text-foreground", column.align === "end" && "text-right")}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`frontend/src/components/Pager.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pager({ page, pageSize, total, onPage }: PagerProps) {
  const { t } = useTranslation();
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav aria-label={t("list.pagination")} className="mt-4 flex items-center justify-end gap-3">
      {page > 1 && (
        <Button size="icon" aria-label={t("list.previous")} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}
      <p className="text-body text-muted-foreground">{t("list.page", { page, pages })}</p>
      {page < pages && (
        <Button size="icon" aria-label={t("list.next")} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
```

`frontend/src/components/FilterBar.tsx`:

```tsx
import { Children, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  /** At most three filters. */
  children: ReactNode;
  /** Further filters, one step away. */
  more?: ReactNode;
}

export function FilterBar({ children, more }: FilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (Children.toArray(children).length > 3) {
    throw new Error("At most three filters are visible (UI rule M5). Pass the others as `more`.");
  }
  return (
    <form role="search" aria-label={t("filters.label")} className="mb-4 flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {more && (
          <Button variant="ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
            {open ? t("filters.fewer") : t("filters.more")}
          </Button>
        )}
      </div>
      {more && open && (
        <div id={id} className="flex flex-wrap items-end gap-3">
          {more}
        </div>
      )}
    </form>
  );
}
```

`frontend/src/components/filters.tsx`:

```tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const labelClass = "text-caption text-muted-foreground";

interface FilterTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "search" | "date";
}

export function FilterText({ label, value, onChange, type = "search" }: FilterTextProps) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1 md:w-56">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1 md:w-56">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

interface FilterDateRangeProps {
  label: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}

/** One filter made of two dates. */
export function FilterDateRange({ label, from, to, onFrom, onTo }: FilterDateRangeProps) {
  const { t } = useTranslation();
  const fromId = useId();
  const toId = useId();
  return (
    <fieldset className="m-0 flex w-full min-w-0 flex-col gap-1 border-0 p-0 md:w-auto">
      <legend className={`${labelClass} mb-1 p-0 font-medium`}>{label}</legend>
      <div className="flex items-center gap-2">
        <Label htmlFor={fromId} className="sr-only">
          {t("filters.from")}
        </Label>
        <Input id={fromId} type="date" value={from} max={to || undefined} onChange={(event) => onFrom(event.target.value)} />
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <Label htmlFor={toId} className="sr-only">
          {t("filters.to")}
        </Label>
        <Input id={toId} type="date" value={to} min={from || undefined} onChange={(event) => onTo(event.target.value)} />
      </div>
    </fieldset>
  );
}
```

`frontend/src/components/useListParams.ts`:

```ts
import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";

const PREFIX = "iris.list:";

/** The address of a list with the filters it last had, for the back link of a detail page. */
export function backToList(path: string): string {
  try {
    return path + (sessionStorage.getItem(PREFIX + path) ?? "");
  } catch {
    return path;
  }
}

export interface ListParams<F extends Record<string, string>> {
  filters: F;
  page: number;
  sort: string;
  /** Page, sort and non-empty filters, ready to pass to the API. */
  query: Record<string, string | number>;
  setFilter: (key: keyof F & string, value: string) => void;
  setPage: (page: number) => void;
  setSort: (sort: string) => void;
}

/** Filters, sort and page kept in the address, so they survive opening an item and coming back. */
export function useListParams<F extends Record<string, string>>(defaults: F): ListParams<F> {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname, search } = useLocation();

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + pathname, search);
    } catch {
      // Storage can be blocked; the back link then returns to the unfiltered list.
    }
  }, [pathname, search]);

  const filters = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof F & string)[]) {
    const value = searchParams.get(key);
    if (value !== null) filters[key] = value as F[keyof F & string];
  }
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page"))) || 1);
  const sort = searchParams.get("ordering") ?? "";

  function update(changes: Record<string, string | null>, keepPage: boolean): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "" || value === defaults[key]) next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  const query: Record<string, string | number> = { page };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  if (sort) query.ordering = sort;

  return {
    filters,
    page,
    sort,
    query,
    setFilter: (key, value) => update({ [key]: value }, false),
    setPage: (next) => update({ page: next <= 1 ? null : String(next) }, true),
    setSort: (next) => update({ ordering: next || null }, false),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/components/lists.test.tsx`
Expected: PASS, 1 file, 10 tests.

- [ ] **Step 5: Check lint and types, then commit**

Run: `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck`
Expected: both exit with code 0.

```bash
git add frontend/src/components
git commit -m "feat(frontend): data table, pager, filter bar and list state kept in the address"
```

---

### Task 7: Shared task and form components

**Files:**
- Create: `frontend/src/components/TaskSheet.tsx`, `ConfirmDialog.tsx`, `Field.tsx`, `FormSummary.tsx`, `useProblemForm.ts`, `TextField.tsx`, `TextAreaField.tsx`, `SelectField.tsx`, `DateField.tsx`, `DateRangeFields.tsx`, `TimeField.tsx`, `FileField.tsx`, `SwitchField.tsx`, `index.ts` (all in `frontend/src/components/`)
- Test: `frontend/src/components/forms.test.tsx`

**Interfaces:**
- Consumes: the primitives of Task 4; `ProblemError` and `problemText` (Task 2); `common` texts (Task 3).
- Produces:
  - `TaskSheet({ open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode })`. A form inside it gets an `id`, and its submit button in `footer` carries `form={id}`.
  - `ConfirmDialog({ title: string; consequence: string; confirmLabel: string; onConfirm: () => void; destructive?: boolean; trigger?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void })`. Either pass `trigger` (the dialog opens itself) or control it with `open` and `onOpenChange`.
  - `Field({ label: string; htmlFor: string; error?: string; hint?: string; optional?: boolean; children: ReactNode })`, `describedBy(id, hint, error): string | undefined`, and the type `BoundFieldProps<T> = { control: Control<T>; name: FieldPath<T>; label: string; hint?: string; optional?: boolean }`.
  - `FormSummary({ problems: string[] })`: the problems that belong to no input, above the form.
  - `useProblemForm(form, options?: { mapField?: (field: string) => string | null })` returning `{ onError(error: unknown): void; summary: string[]; clear(): void }`. `onError` puts each server problem on the input of the same name (a dotted path such as `roles.0`, which the API uses for one entry of a list, goes to the input named by its first part), focuses the first one, and sends the rest to `summary`.
  - Inputs bound to react-hook-form, all taking `BoundFieldProps<T>`: `TextField` (plus any `<input>` attribute), `TextAreaField`, `SelectField` (plus `options: { value: string; label: string }[]`, `placeholder?: string`), `DateField` (plus `min?`, `max?`; value `YYYY-MM-DD`), `TimeField` (value `HH:MM`, quarter-hour steps), `FileField` (plus `accept?`; value `File | null`), `SwitchField` (value `boolean`), and `DateRangeFields({ control, startName, endName, startLabel, endLabel })`.
  - `@/components` (the barrel `index.ts`) re-exports every shared component of Tasks 5 to 7 and Task 9.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/forms.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { DateRangeFields } from "./DateRangeFields";
import { FileField } from "./FileField";
import { FormSummary } from "./FormSummary";
import { SelectField } from "./SelectField";
import { SwitchField } from "./SwitchField";
import { TaskSheet } from "./TaskSheet";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { TimeField } from "./TimeField";
import { useProblemForm } from "./useProblemForm";

interface Values {
  email: string;
  note: string;
  kind: string;
  day: string;
  start: string;
  end: string;
  at: string;
  active: boolean;
  file: File | null;
}

const empty: Values = { email: "", note: "", kind: "", day: "", start: "", end: "", at: "", active: false, file: null };

function Harness({ send, mapField }: { send: (values: Values) => Promise<void>; mapField?: (field: string) => string | null }) {
  const form = useForm<Values>({ defaultValues: empty });
  const problems = useProblemForm(form, { mapField });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        problems.clear();
        try {
          await send(values);
        } catch (error) {
          problems.onError(error);
        }
      })}
    >
      <FormSummary problems={problems.summary} />
      <TextField control={form.control} name="email" label="Adresse" hint="Votre adresse professionnelle" />
      <TextAreaField control={form.control} name="note" label="Note" optional />
      <SelectField control={form.control} name="kind" label="Type" placeholder="Choisir" options={[{ value: "a", label: "Option A" }]} />
      <DateField control={form.control} name="day" label="Jour" />
      <DateRangeFields control={form.control} startName="start" endName="end" startLabel="Début" endLabel="Fin" />
      <TimeField control={form.control} name="at" label="Heure" />
      <SwitchField control={form.control} name="active" label="Actif" />
      <FileField control={form.control} name="file" label="Justificatif" />
      <Button type="submit" variant="primary">
        Envoyer
      </Button>
    </form>
  );
}

const refusal = (errors: ProblemError["errors"]) => new ProblemError({ status: 400, code: "validation", detail: "Refusé.", errors, requestId: "r1" });

describe("bound fields", () => {
  it("collect every kind of value", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<Harness send={send} />);
    const file = new File(["%PDF-1.7"], "certificat.pdf", { type: "application/pdf" });

    await user.type(screen.getByLabelText("Adresse"), "sami@impactrisks.com");
    await user.type(screen.getByLabelText(/^Note/), "Bonjour");
    await user.selectOptions(screen.getByLabelText("Type"), "a");
    await user.type(screen.getByLabelText("Jour"), "2026-11-03");
    await user.type(screen.getByLabelText("Début"), "2026-11-04");
    await user.type(screen.getByLabelText("Fin"), "2026-11-06");
    await user.type(screen.getByLabelText("Heure"), "09:30");
    await user.click(screen.getByRole("switch", { name: "Actif" }));
    await user.upload(screen.getByLabelText("Justificatif"), file);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(send).toHaveBeenCalledWith({
      email: "sami@impactrisks.com",
      note: "Bonjour",
      kind: "a",
      day: "2026-11-03",
      start: "2026-11-04",
      end: "2026-11-06",
      at: "09:30",
      active: true,
      file,
    });
    expect(screen.getByLabelText("Fin")).toHaveAttribute("min", "2026-11-04");
    expect(screen.getByLabelText("Heure")).toHaveAttribute("step", "900");
  });

  it("mark an optional field and let a chosen file be removed", async () => {
    const user = userEvent.setup();
    render(<Harness send={vi.fn()} />);
    expect(screen.getByLabelText("Note (facultatif)")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Justificatif"), new File(["x"], "preuve.png", { type: "image/png" }));
    expect(screen.getByText("preuve.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer le fichier" }));
    expect(screen.queryByText("preuve.png")).not.toBeInTheDocument();
  });
});

describe("useProblemForm", () => {
  it("puts a server error next to its field, keeps what was typed and moves there", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "email", code: "accounts.email_taken", detail: "Cette adresse est déjà utilisée.", params: {} }]));
    render(<Harness send={send} />);
    await user.type(screen.getByLabelText("Adresse"), "sami@impactrisks.com");
    await user.type(screen.getByLabelText(/^Note/), "Bonjour");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    const input = await screen.findByRole("textbox", { name: "Adresse", description: /Cette adresse est déjà utilisée\./ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("sami@impactrisks.com");
    expect(input).toHaveFocus();
    expect(screen.getByLabelText(/^Note/)).toHaveValue("Bonjour");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists problems that belong to no field above the form", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(
      refusal([
        { field: null, code: "auth.invalid_credentials", detail: "Adresse ou mot de passe incorrect.", params: {} },
        { field: "unknown_field", code: "x", detail: "Autre problème.", params: {} },
      ]),
    );
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Adresse ou mot de passe incorrect.");
    expect(alert).toHaveTextContent("Autre problème.");
  });

  it("puts a problem about one entry of a list on the input of the list", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "email.0", code: "validation.invalid_choice", detail: "Valeur refusée.", params: {} }]));
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("textbox", { name: "Adresse", description: /Valeur refusée\./ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can send a server field to another input", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(refusal([{ field: "value", code: "settings.out_of_range", detail: "Valeur hors limites.", params: {} }]));
    render(<Harness send={send} mapField={(field) => (field === "value" ? "email" : field)} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("textbox", { name: "Adresse", description: /Valeur hors limites\./ })).toBeInTheDocument();
  });

  it("says something readable when the failure is not a problem, and clears it on the next try", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    render(<Harness send={send} />);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Une erreur est survenue. Veuillez réessayer.");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return (
    <TaskSheet open={open} onOpenChange={setOpen} title="Rôles" description="Ajoutez ou retirez un rôle." footer={<Button variant="primary">Terminé</Button>}>
      <p>Contenu de la tâche</p>
    </TaskSheet>
  );
}

describe("TaskSheet", () => {
  it("holds a focused task with its title, body and footer, and closes", async () => {
    render(<SheetHarness />);
    const dialog = screen.getByRole("dialog", { name: "Rôles" });
    expect(dialog).toHaveAccessibleDescription("Ajoutez ou retirez un rôle.");
    expect(within(dialog).getByText("Contenu de la tâche")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Terminé" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("states the consequence and acts only on confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Désactiver</Button>}
        title="Désactiver ce compte ?"
        consequence="La personne est déconnectée immédiatement et ne peut plus se connecter."
        confirmLabel="Désactiver le compte"
        destructive
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Désactiver ce compte ?" });
    expect(dialog).toHaveAccessibleDescription("La personne est déconnectée immédiatement et ne peut plus se connecter.");

    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    await user.click(await screen.findByRole("button", { name: "Désactiver le compte" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/components/forms.test.tsx`
Expected: FAIL with `Failed to resolve import "./ConfirmDialog"`.

- [ ] **Step 3: Write the sheet and the dialog**

`frontend/src/components/TaskSheet.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface TaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Buttons. A submit button here carries form="<id of the form in children>". */
  footer?: ReactNode;
}

/** A focused task: a 480px sheet on the right, the whole screen on a phone. */
export function TaskSheet({ open, onOpenChange, title, description, children, footer }: TaskSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t("actions.close")} {...(description ? {} : { "aria-describedby": undefined })}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
```

`frontend/src/components/ConfirmDialog.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  title: string;
  /** What will happen, in one sentence. */
  consequence: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  /** The button that opens the dialog. Leave out to control it with `open`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Nothing irreversible happens without a confirmation that states the consequence (U6). */
export function ConfirmDialog({ title, consequence, confirmLabel, onConfirm, destructive = false, trigger, open, onOpenChange }: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{consequence}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Write the field, the summary and the hook**

`frontend/src/components/Field.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";

/** What every input bound to react-hook-form takes. */
export interface BoundFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  optional?: boolean;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}

/** The ids an input lists in aria-describedby so that its hint and its error are read with it. */
export function describedBy(id: string, hint: string | undefined, error: string | undefined): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/** A labelled input with its hint and, next to it, its error (U5). */
export function Field({ label, htmlFor, error, hint, optional = false, children }: FieldProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {optional ? `${label} (${t("form.optional")})` : label}
      </Label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </div>
  );
}
```

`frontend/src/components/FormSummary.tsx`:

```tsx
import { useTranslation } from "react-i18next";

/** Problems that belong to no input, shown above the form. */
export function FormSummary({ problems }: { problems: string[] }) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-[var(--refused-border)] bg-refused-bg px-4 py-3 text-body text-refused">
      {problems.length === 1 ? (
        <p>{problems[0]}</p>
      ) : (
        <>
          <p className="font-semibold">{t("form.summaryTitle")}</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

`frontend/src/components/useProblemForm.ts`:

```ts
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ProblemError } from "@/api/problem";
import { problemText } from "@/api/problemText";

interface Options {
  /** Renames a server field to a form field, or returns null to send the problem to the summary. */
  mapField?: (field: string) => string | null;
}

/**
 * Shows a failed submission: each problem next to the input of the same name, the rest above the form.
 * It never resets the form, so what the user typed stays (U5).
 */
export function useProblemForm<T extends FieldValues>(form: UseFormReturn<T>, options: Options = {}) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<string[]>([]);
  const { mapField } = options;

  const onError = useCallback(
    (error: unknown) => {
      const general: string[] = [];
      let first: string | null = null;
      if (error instanceof ProblemError && error.errors.length > 0) {
        const values = form.getValues();
        for (const problem of error.errors) {
          const named = problem.field === null ? null : mapField ? mapField(problem.field) : problem.field;
          // The API names one entry of a list by its position ("roles.0"): the input is the list itself.
          const head = named === null ? null : named.split(".")[0];
          const target = named !== null && named in values ? named : head !== null && head in values ? head : null;
          if (target !== null) {
            form.setError(target as Path<T>, { type: "server", message: problem.detail });
            first ??= target;
          } else {
            general.push(problem.detail || problemText(error, t));
          }
        }
      } else {
        general.push(problemText(error, t));
      }
      setSummary(general);
      if (first !== null) {
        try {
          form.setFocus(first as Path<T>);
        } catch {
          // The input cannot take focus (a file input, a switch): its error is still shown next to it.
        }
      }
    },
    [form, mapField, t],
  );

  const clear = useCallback(() => setSummary([]), []);

  return { onError, summary, clear };
}
```

- [ ] **Step 5: Write the bound inputs**

`frontend/src/components/TextField.tsx`:

```tsx
import { useId, type ComponentProps } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { describedBy, Field, type BoundFieldProps } from "./Field";

type InputProps = Omit<ComponentProps<"input">, "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "id">;

export function TextField<T extends FieldValues>({ control, name, label, hint, optional, ...input }: BoundFieldProps<T> & InputProps) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Input
        {...input}
        id={id}
        name={field.name}
        ref={field.ref}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Field>
  );
}
```

`frontend/src/components/TextAreaField.tsx`:

```tsx
import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, Field, type BoundFieldProps } from "./Field";

export function TextAreaField<T extends FieldValues>({ control, name, label, hint, optional, rows = 3 }: BoundFieldProps<T> & { rows?: number }) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Textarea
        id={id}
        rows={rows}
        name={field.name}
        ref={field.ref}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Field>
  );
}
```

`frontend/src/components/SelectField.tsx`:

```tsx
import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { NativeSelect } from "@/components/ui/native-select";
import { describedBy, Field, type BoundFieldProps } from "./Field";

interface SelectFieldExtras {
  options: { value: string; label: string }[];
  /** Text of the empty first choice. Leave out when a value is always selected. */
  placeholder?: string;
}

export function SelectField<T extends FieldValues>({ control, name, label, hint, optional, options, placeholder }: BoundFieldProps<T> & SelectFieldExtras) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <NativeSelect
        id={id}
        name={field.name}
        ref={field.ref}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
```

`frontend/src/components/DateField.tsx`:

```tsx
import type { FieldValues } from "react-hook-form";
import type { BoundFieldProps } from "./Field";
import { TextField } from "./TextField";

/** A calendar date as YYYY-MM-DD, entered with the browser's own date control. */
export function DateField<T extends FieldValues>(props: BoundFieldProps<T> & { min?: string; max?: string }) {
  return <TextField {...props} type="date" />;
}
```

`frontend/src/components/TimeField.tsx`:

```tsx
import type { FieldValues } from "react-hook-form";
import type { BoundFieldProps } from "./Field";
import { TextField } from "./TextField";

/** A time as HH:MM, in quarter-hour steps. */
export function TimeField<T extends FieldValues>(props: BoundFieldProps<T>) {
  return <TextField {...props} type="time" step={900} />;
}
```

`frontend/src/components/DateRangeFields.tsx`:

```tsx
import { useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { DateField } from "./DateField";

interface DateRangeFieldsProps<T extends FieldValues> {
  control: Control<T>;
  startName: FieldPath<T>;
  endName: FieldPath<T>;
  startLabel: string;
  endLabel: string;
}

/** Two dates side by side; the end cannot be picked before the start. */
export function DateRangeFields<T extends FieldValues>({ control, startName, endName, startLabel, endLabel }: DateRangeFieldsProps<T>) {
  const start = useWatch({ control, name: startName }) as string | undefined;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DateField control={control} name={startName} label={startLabel} />
      <DateField control={control} name={endName} label={endLabel} min={start || undefined} />
    </div>
  );
}
```

`frontend/src/components/SwitchField.tsx`:

```tsx
import { useId } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BoundFieldProps } from "./Field";

export function SwitchField<T extends FieldValues>({ control, name, label, hint }: BoundFieldProps<T>) {
  const id = useId();
  const { field } = useController({ control, name });
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="text-caption text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        ref={field.ref}
        checked={Boolean(field.value)}
        onCheckedChange={field.onChange}
        onBlur={field.onBlur}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}
```

`frontend/src/components/FileField.tsx`:

```tsx
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useController, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { describedBy, Field, type BoundFieldProps } from "./Field";

/** One file. The value is the File, or null. The API accepts PDF, JPG and PNG. */
export function FileField<T extends FieldValues>({ control, name, label, hint, optional, accept = ".pdf,.jpg,.jpeg,.png" }: BoundFieldProps<T> & { accept?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  const file = field.value as File | null | undefined;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        type="file"
        accept={accept}
        name={field.name}
        ref={(element) => {
          input.current = element;
          field.ref(element);
        }}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.files?.[0] ?? null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="block w-full text-body text-text-secondary file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-input file:bg-secondary file:px-4 file:font-semibold file:text-secondary-foreground md:file:h-10"
      />
      {file && (
        <p className="flex items-center gap-3 text-caption text-muted-foreground">
          <span>{file.name}</span>
          <Button
            variant="link"
            size="inline"
            onClick={() => {
              if (input.current) input.current.value = "";
              field.onChange(null);
            }}
          >
            {t("form.fileRemove")}
          </Button>
        </p>
      )}
    </Field>
  );
}
```

`frontend/src/components/index.ts`:

```ts
export { ConfirmDialog } from "./ConfirmDialog";
export { DataTable, type Column } from "./DataTable";
export { DateField } from "./DateField";
export { DateRangeFields } from "./DateRangeFields";
export { Disclosure } from "./Disclosure";
export { EmptyState } from "./EmptyState";
export { describedBy, Field, type BoundFieldProps } from "./Field";
export { Figure } from "./Figure";
export { FileField } from "./FileField";
export { FilterBar } from "./FilterBar";
export { FilterDateRange, FilterSelect, FilterText } from "./filters";
export { FormSummary } from "./FormSummary";
export { PageHeader } from "./PageHeader";
export { PageLoading } from "./PageLoading";
export { Pager } from "./Pager";
export { SelectField } from "./SelectField";
export { StatusBadge, type StatusTone } from "./StatusBadge";
export { SwitchField } from "./SwitchField";
export { TaskSheet } from "./TaskSheet";
export { TextAreaField } from "./TextAreaField";
export { TextField } from "./TextField";
export { TimeField } from "./TimeField";
export { toast, Toaster } from "./toast";
export { useIsPhone } from "./useIsPhone";
export { backToList, useListParams, type ListParams } from "./useListParams";
export { useProblemForm } from "./useProblemForm";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/components/forms.test.tsx`
Expected: PASS, 1 file, 9 tests.

If the first test fails because typing into the date or time input leaves it empty, the installed `user-event` wants the value in one go: replace `user.type(input, "2026-11-03")` with `fireEvent.change(input, { target: { value: "2026-11-03" } })` (import `fireEvent` from `@testing-library/react`) for those four inputs. The component does not change.

- [ ] **Step 7: Check lint and types, then commit**

Run: `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck`
Expected: both exit with code 0.

```bash
git add frontend/src/components
git commit -m "feat(frontend): task sheet, confirmation, bound form fields and server-error mapping"
```

---

### Task 8: Session, workspaces and the navigation model

**Files:**
- Create: `frontend/src/features/auth/session.ts`, `frontend/src/features/auth/api.ts`
- Create: `frontend/src/app/workspaces.ts`, `frontend/src/app/homes.ts`, `frontend/src/app/sharedRoutes.tsx`, `frontend/src/app/navigation.ts`
- Create: `frontend/src/workspaces/me/routes.tsx`, `frontend/src/workspaces/team/routes.tsx`, `frontend/src/workspaces/hr/routes.tsx`, `frontend/src/workspaces/overview/routes.tsx`, `frontend/src/workspaces/admin/routes.tsx`
- Create: `frontend/src/test/fixtures.ts`, `frontend/src/test/render.tsx`
- Modify: `frontend/src/test/setup.ts`
- Test: `frontend/src/app/navigation.test.ts`, `frontend/src/features/auth/api.test.tsx`, `frontend/src/test/render.test.tsx`

**Interfaces:**
- Consumes: `api`, `call`, `ProblemError` and the types of Task 2; master 7.2 (`auth/me`, `auth/login`, `auth/logout`, `auth/password`) and 7.1 (`health`).
- Produces:
  - `@/app/workspaces`: `WorkspaceId`, `NavEntry`, `Workspace`, `WORKSPACES`, `WORKSPACE_IDS` (switcher order: me, team, hr, overview, admin), `LANDING_ORDER`, exactly as master 9.1.
  - `@/app/homes`: `HOMES` (empty here; Task 16 adds the `admin` line).
  - `@/app/sharedRoutes`: `sharedRoutes: RouteObject[]`, the routes inside the shell that belong to no workspace, with absolute paths. Empty here. **A later plan adds a page such as `/requests/:id` by appending to this array.**
  - `@/workspaces/<id>/routes`: `meRoutes`, `teamRoutes`, `hrRoutes`, `overviewRoutes`, `adminRoutes`, each a `RouteObject[]` with paths relative to the workspace. Empty here.
  - `@/app/navigation`: `Registry`, `WORKSPACE_ROUTES`, `isWorkspaceId(value)`, `visibleNav(id, registry?)`, `availableWorkspaces(me, registry?)`, `landingWorkspace(me, registry?)`, `workspaceOfPath(pathname)`, `routePatterns(registry?, shared?)`, `patternFor(pathname, patterns?)`.
  - `@/features/auth/session` (memory only, never browser storage): `markSignedIn()`, `signInNoticePending()`, `clearSignInNotice()`, `markSignedOut()`, `wasSignedOut()`, `rememberTemporaryPassword(password)`, `temporaryPasswordInMemory()`, `forgetTemporaryPassword()`, `resetSessionMemory()`.
  - `@/features/auth/api`: `meKey`, `fetchMe(): Promise<Me | null>`, `useMe()`, `useCurrentUser(): Me`, `signIn(credentials): Promise<Me>`, `updateMe(changes): Promise<Me>`, `completeSignIn(queryClient, me)`, `useUpdateMe()`, `useLogout()`, `useChangePassword()`, `useHealth()`.
  - `@/test/fixtures`: `makeMe(overrides?)` (workspaces follow `roles` unless given), `makePage(results, count?)`, `problemResponse(status, code, detail, fields?)`.
  - `@/test/render`: `renderApp(ui, { route?, path?, me?, queryClient? })` returning the Testing Library result plus `router` and `queryClient`; `makeTestQueryClient()`. The page is mounted under the registered route pattern that matches `route`, so `useParams` works; any other address shows `data-testid="elsewhere"` with the address in it; and when a signed-in page loses its user (sign-out, session end) it is replaced by `data-testid="signed-out"`, as `RequireAuth` would do.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/navigation.test.ts`:

```ts
import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { availableWorkspaces, isWorkspaceId, landingWorkspace, patternFor, routePatterns, visibleNav, workspaceOfPath, type Registry } from "./navigation";
import { LANDING_ORDER, WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from "./workspaces";

function registry(routes: Partial<Record<WorkspaceId, RouteObject[]>>, homes: WorkspaceId[] = []): Registry {
  return {
    routes: { me: [], team: [], hr: [], overview: [], admin: [], ...routes },
    homes: Object.fromEntries(homes.map((id) => [id, true])),
  };
}

const page = (path: string): RouteObject => ({ path, element: null });

describe("the workspaces of the UI document", () => {
  it("are five, each with at most six entries under its own address", () => {
    expect(WORKSPACE_IDS).toEqual(["me", "team", "hr", "overview", "admin"]);
    expect(LANDING_ORDER).toEqual(["admin", "hr", "overview", "team", "me"]);
    for (const id of WORKSPACE_IDS) {
      const workspace = WORKSPACES[id];
      expect(workspace.home).toBe(`/${id}`);
      expect(workspace.nav.length).toBeLessThanOrEqual(6);
      expect(workspace.nav[0].path).toBe(workspace.home);
      for (const entry of workspace.nav) expect(entry.path === workspace.home || entry.path.startsWith(`${workspace.home}/`)).toBe(true);
    }
    expect(WORKSPACES.admin.nav.map((entry) => entry.path)).toEqual(["/admin", "/admin/accounts", "/admin/parameters", "/admin/security-log"]);
    expect(WORKSPACES.me.nav.map((entry) => entry.path)).toEqual(["/me", "/me/requests", "/me/calendar", "/me/balance", "/me/profile"]);
  });
});

describe("visibleNav", () => {
  it("shows an entry only when a page exists for it", () => {
    const only = registry({ admin: [page("accounts"), page("accounts/new"), page("accounts/:id")] });
    expect(visibleNav("admin", only).map((entry) => entry.path)).toEqual(["/admin/accounts"]);
  });

  it("shows the home entry only when a home is registered", () => {
    const withHome = registry({ admin: [page("accounts")] }, ["admin"]);
    expect(visibleNav("admin", withHome).map((entry) => entry.path)).toEqual(["/admin", "/admin/accounts"]);
    expect(visibleNav("me", withHome)).toEqual([]);
  });
});

describe("availableWorkspaces", () => {
  it("needs both the role and at least one page", () => {
    const built = registry({ admin: [page("accounts")], team: [page("people")] });
    expect(availableWorkspaces(makeMe({ roles: ["sysadmin"] }), built)).toEqual(["admin"]);
    expect(availableWorkspaces(makeMe({ roles: ["employee", "manager"] }), built)).toEqual(["team"]);
    expect(availableWorkspaces(makeMe({ roles: ["employee"] }), built)).toEqual([]);
  });

  it("lists them in the order of the switcher", () => {
    const built = registry({ me: [page("profile")], team: [page("people")], overview: [page("people")] });
    expect(availableWorkspaces(makeMe({ roles: ["exec", "manager", "employee"] }), built)).toEqual(["me", "team", "overview"]);
  });
});

describe("landingWorkspace", () => {
  const built = registry({ me: [page("profile")], team: [page("people")], hr: [page("employees")], admin: [page("accounts")] });

  it("is the workspace used last, when it is still available", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager", "hr"], last_workspace: "me" }), built)).toBe("me");
  });

  it("is the most specific workspace on a first sign-in", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager", "hr"], last_workspace: "" }), built)).toBe("hr");
    expect(landingWorkspace(makeMe({ roles: ["employee", "manager"], last_workspace: "" }), built)).toBe("team");
  });

  it("ignores a last workspace the person no longer has", () => {
    expect(landingWorkspace(makeMe({ roles: ["employee"], last_workspace: "hr" }), built)).toBe("me");
  });

  it("is nothing for a person without any workspace", () => {
    expect(landingWorkspace(makeMe({ roles: [] }), built)).toBeNull();
  });
});

describe("addresses", () => {
  it("tell which workspace a page belongs to", () => {
    expect(workspaceOfPath("/admin/accounts/abc")).toBe("admin");
    expect(workspaceOfPath("/me")).toBe("me");
    expect(workspaceOfPath("/notifications")).toBeNull();
    expect(isWorkspaceId("hr")).toBe(true);
    expect(isWorkspaceId("root")).toBe(false);
  });

  it("resolve to the most specific registered pattern", () => {
    const built = registry({ admin: [page("accounts"), page("accounts/new"), page("accounts/:id")] });
    const patterns = routePatterns(built, [page("/requests/:id")]);
    expect(patternFor("/admin/accounts/new", patterns)).toBe("/admin/accounts/new");
    expect(patternFor("/admin/accounts/abc", patterns)).toBe("/admin/accounts/:id");
    expect(patternFor("/requests/r1", patterns)).toBe("/requests/:id");
    expect(patternFor("/login", patterns)).toBe("/login");
    expect(patternFor("/nowhere/at/all", patterns)).toBe("*");
  });
});
```

`frontend/src/features/auth/api.test.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ProblemError } from "@/api/problem";
import { makeMe, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { completeSignIn, fetchMe, meKey, useChangePassword, useLogout } from "./api";
import { signInNoticePending, wasSignedOut } from "./session";

function wrapperFor(queryClient = makeTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

describe("fetchMe", () => {
  it("returns the user when a session exists", async () => {
    server.use(http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ name: "Samia Admin" }))));
    expect((await fetchMe())?.name).toBe("Samia Admin");
  });

  it("returns null when nobody is signed in", async () => {
    server.use(http.get("/api/v1/auth/me", () => problemResponse(401, "core.not_authenticated", "Connectez-vous.")));
    expect(await fetchMe()).toBeNull();
  });

  it("lets an outage through, so that it is not mistaken for 'signed out'", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html></html>", { status: 502 })));
    const error = await fetchMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).unavailable).toBe(true);
  });
});

describe("completeSignIn", () => {
  it("stores the user, drops what a previous user left, and arms the sign-in notice", () => {
    const { queryClient } = wrapperFor();
    queryClient.setQueryData(["accounts", "list"], ["left over"]);
    completeSignIn(queryClient, makeMe({ name: "Leila RH" }));
    expect(queryClient.getQueryData(meKey)).toMatchObject({ name: "Leila RH" });
    expect(queryClient.getQueryData(["accounts", "list"])).toBeUndefined();
    expect(signInNoticePending()).toBe(true);
  });
});

describe("useLogout", () => {
  it("ends the session and forgets everything", async () => {
    server.use(http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    queryClient.setQueryData(["accounts", "list"], ["cached"]);
    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    expect(queryClient.getQueryData(["accounts", "list"])).toBeUndefined();
    expect(wasSignedOut()).toBe(true);
  });
});

describe("useChangePassword", () => {
  it("reads the user again, because the obligation to change is now lifted", async () => {
    let asked = 0;
    server.use(
      http.post("/api/v1/auth/password", () => new HttpResponse(null, { status: 204 })),
      http.get("/api/v1/auth/me", () => {
        asked += 1;
        return HttpResponse.json(makeMe({ must_change_password: false }));
      }),
    );
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe({ must_change_password: true }));
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    result.current.mutate({ current_password: "Temp-1234-abcd", new_password: "Correct-Horse-42!" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(queryClient.getQueryState(meKey)?.isInvalidated).toBe(true));
    await queryClient.fetchQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 0 });
    expect(asked).toBe(1);
    expect(queryClient.getQueryData(meKey)).toMatchObject({ must_change_password: false });
  });
});
```

`frontend/src/test/render.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigate, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { useCurrentUser, useMe } from "@/features/auth/api";
import { makeMe } from "./fixtures";
import { renderApp } from "./render";

function Probe() {
  const { id } = useParams();
  const me = useCurrentUser();
  const navigate = useNavigate();
  return (
    <div>
      <p>param:{id ?? "none"}</p>
      <p>user:{me.name}</p>
      <button onClick={() => navigate("/admin/accounts?state=locked")}>go</button>
    </div>
  );
}

function AnonymousProbe() {
  const me = useMe();
  return <p>{me.data === null ? "anonymous" : "signed in"}</p>;
}

describe("renderApp", () => {
  it("mounts a page under a route pattern with a signed-in user", () => {
    renderApp(<Probe />, { route: "/things/42", path: "/things/:id", me: makeMe({ name: "Samia Admin" }) });
    expect(screen.getByText("param:42")).toBeInTheDocument();
    expect(screen.getByText("user:Samia Admin")).toBeInTheDocument();
  });

  it("shows where the page went when it navigates away", async () => {
    const { router } = renderApp(<Probe />, { route: "/things/42", path: "/things/:id" });
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/admin/accounts?state=locked");
    expect(router.state.location.pathname).toBe("/admin/accounts");
  });

  it("can render for nobody", () => {
    renderApp(<AnonymousProbe />, { me: null });
    expect(screen.getByText("anonymous")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/app src/features/auth src/test`
Expected: FAIL with `Failed to resolve import "@/test/fixtures"`, `"./navigation"` and `"./api"`.

- [ ] **Step 3: Write the session memory and the auth hooks**

`frontend/src/features/auth/session.ts`:

```ts
// What has to survive from sign-in to the first page. It lives in memory only:
// nothing here is ever written to browser storage or to the address.
let noticePending = false;
let signedOut = false;
let temporaryPassword: string | null = null;

/** A sign-in just happened: the "previous sign-in" notice is due once. */
export function markSignedIn(): void {
  noticePending = true;
  signedOut = false;
}

export function signInNoticePending(): boolean {
  return noticePending;
}

export function clearSignInNotice(): void {
  noticePending = false;
}

/** The user chose to sign out: Sign in must not send them back to where they were. */
export function markSignedOut(): void {
  signedOut = true;
  noticePending = false;
  temporaryPassword = null;
}

export function wasSignedOut(): boolean {
  return signedOut;
}

/** Kept from Sign in to "Choose a new password", so the user does not type the temporary password twice. */
export function rememberTemporaryPassword(password: string): void {
  temporaryPassword = password;
}

export function temporaryPasswordInMemory(): string | null {
  return temporaryPassword;
}

export function forgetTemporaryPassword(): void {
  temporaryPassword = null;
}

export function resetSessionMemory(): void {
  noticePending = false;
  signedOut = false;
  temporaryPassword = null;
}
```

`frontend/src/features/auth/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import { ProblemError } from "@/api/problem";
import type { Credentials, Me, MeChanges, PasswordChange } from "@/api/types";
import { markSignedIn, markSignedOut } from "./session";

export const meKey = ["auth", "me"] as const;

/** The signed-in user, or null when nobody is signed in. An outage is thrown, not turned into null. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await call(api.GET("/api/v1/auth/me"));
  } catch (error) {
    if (error instanceof ProblemError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 5 * 60_000 });
}

/** The user, for pages behind RequireAuth. */
export function useCurrentUser(): Me {
  const { data } = useMe();
  if (!data) throw new Error("useCurrentUser is only for pages behind RequireAuth.");
  return data;
}

export function signIn(credentials: Credentials): Promise<Me> {
  return call(api.POST("/api/v1/auth/login", { body: credentials }));
}

export function updateMe(changes: MeChanges): Promise<Me> {
  return call(api.PATCH("/api/v1/auth/me", { body: changes }));
}

function dropEverythingButTheSession(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" && query.queryKey[0] !== "health" });
}

/** Puts the user in the cache: from here on the application is signed in. */
export function completeSignIn(queryClient: QueryClient, me: Me): void {
  markSignedIn();
  dropEverythingButTheSession(queryClient);
  queryClient.setQueryData(meKey, me);
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST("/api/v1/auth/logout")),
    onSuccess: () => {
      markSignedOut();
      queryClient.setQueryData(meKey, null);
      dropEverythingButTheSession(queryClient);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PasswordChange) => call(api.POST("/api/v1/auth/password", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

/** Public. Used before sign-in to know which stack this is. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"] as const,
    queryFn: () => call(api.GET("/api/v1/health")),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 4: Write the workspaces and their registries**

`frontend/src/app/workspaces.ts`:

```ts
import {
  Activity,
  Calendar,
  ClipboardList,
  Eye,
  FileText,
  House,
  Inbox,
  KeyRound,
  Repeat,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceId = "me" | "team" | "hr" | "overview" | "admin";

export interface NavEntry {
  path: string;
  labelKey: string;
  icon: LucideIcon;
}

export interface Workspace {
  id: WorkspaceId;
  labelKey: string;
  home: string;
  nav: NavEntry[];
}

/** The order of the switcher (UI 3.1). */
export const WORKSPACE_IDS: WorkspaceId[] = ["me", "team", "hr", "overview", "admin"];

/** Most specific first: where a person lands on a first sign-in (UI 3.2). */
export const LANDING_ORDER: WorkspaceId[] = ["admin", "hr", "overview", "team", "me"];

/**
 * The complete navigation of the UI document. An entry is drawn only once a page exists for it
 * (see navigation.ts), so plans add pages and never edit this file.
 */
export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  me: {
    id: "me",
    labelKey: "nav:workspaces.me",
    home: "/me",
    nav: [
      { path: "/me", labelKey: "nav:me.home", icon: House },
      { path: "/me/requests", labelKey: "nav:me.requests", icon: FileText },
      { path: "/me/calendar", labelKey: "nav:me.calendar", icon: Calendar },
      { path: "/me/balance", labelKey: "nav:me.balance", icon: Wallet },
      { path: "/me/profile", labelKey: "nav:me.profile", icon: User },
    ],
  },
  team: {
    id: "team",
    labelKey: "nav:workspaces.team",
    home: "/team",
    nav: [
      { path: "/team", labelKey: "nav:team.decide", icon: Inbox },
      { path: "/team/people", labelKey: "nav:team.people", icon: Users },
      { path: "/team/requests", labelKey: "nav:team.requests", icon: FileText },
      { path: "/team/calendar", labelKey: "nav:team.calendar", icon: Calendar },
      { path: "/team/delegations", labelKey: "nav:team.delegations", icon: Repeat },
      { path: "/team/reports", labelKey: "nav:team.reports", icon: TrendingUp },
    ],
  },
  hr: {
    id: "hr",
    labelKey: "nav:workspaces.hr",
    home: "/hr",
    nav: [
      { path: "/hr", labelKey: "nav:hr.desk", icon: ClipboardList },
      { path: "/hr/requests", labelKey: "nav:hr.requests", icon: FileText },
      { path: "/hr/employees", labelKey: "nav:hr.employees", icon: Users },
      { path: "/hr/calendar", labelKey: "nav:hr.calendar", icon: Calendar },
      { path: "/hr/reports", labelKey: "nav:hr.reports", icon: TrendingUp },
      { path: "/hr/settings", labelKey: "nav:hr.settings", icon: Settings },
    ],
  },
  overview: {
    id: "overview",
    labelKey: "nav:workspaces.overview",
    home: "/overview",
    nav: [
      { path: "/overview", labelKey: "nav:overview.home", icon: Eye },
      { path: "/overview/people", labelKey: "nav:overview.people", icon: Users },
      { path: "/overview/requests", labelKey: "nav:overview.requests", icon: FileText },
      { path: "/overview/calendar", labelKey: "nav:overview.calendar", icon: Calendar },
      { path: "/overview/reports", labelKey: "nav:overview.reports", icon: TrendingUp },
      { path: "/overview/oversight", labelKey: "nav:overview.oversight", icon: ShieldCheck },
    ],
  },
  admin: {
    id: "admin",
    labelKey: "nav:workspaces.admin",
    home: "/admin",
    nav: [
      { path: "/admin", labelKey: "nav:admin.status", icon: Activity },
      { path: "/admin/accounts", labelKey: "nav:admin.accounts", icon: KeyRound },
      { path: "/admin/parameters", labelKey: "nav:admin.parameters", icon: SlidersHorizontal },
      { path: "/admin/security-log", labelKey: "nav:admin.securityLog", icon: ShieldCheck },
    ],
  },
};
```

`frontend/src/app/homes.ts`:

```ts
import type { ComponentType, LazyExoticComponent } from "react";
import type { WorkspaceId } from "./workspaces";

// One line per workspace; a plan adds a line or replaces the value of a line.
export const HOMES: Partial<Record<WorkspaceId, LazyExoticComponent<ComponentType>>> = {};
```

`frontend/src/app/sharedRoutes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages inside the shell that belong to no workspace, with absolute paths.
// A plan adds a page by appending an element to this array.
export const sharedRoutes: RouteObject[] = [];
```

`frontend/src/workspaces/me/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages of My space, with paths relative to /me. A plan adds a page by appending an element.
export const meRoutes: RouteObject[] = [];
```

`frontend/src/workspaces/team/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages of My team, with paths relative to /team. A plan adds a page by appending an element.
export const teamRoutes: RouteObject[] = [];
```

`frontend/src/workspaces/hr/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages of the HR desk, with paths relative to /hr. A plan adds a page by appending an element.
export const hrRoutes: RouteObject[] = [];
```

`frontend/src/workspaces/overview/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages of Overview, with paths relative to /overview. A plan adds a page by appending an element.
export const overviewRoutes: RouteObject[] = [];
```

`frontend/src/workspaces/admin/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [];
```

`frontend/src/app/navigation.ts`:

```ts
import { matchPath, type RouteObject } from "react-router";
import type { Me } from "@/api/types";
import { adminRoutes } from "@/workspaces/admin/routes";
import { hrRoutes } from "@/workspaces/hr/routes";
import { meRoutes } from "@/workspaces/me/routes";
import { overviewRoutes } from "@/workspaces/overview/routes";
import { teamRoutes } from "@/workspaces/team/routes";
import { HOMES } from "./homes";
import { sharedRoutes } from "./sharedRoutes";
import { LANDING_ORDER, WORKSPACE_IDS, WORKSPACES, type NavEntry, type WorkspaceId } from "./workspaces";

export const WORKSPACE_ROUTES: Record<WorkspaceId, RouteObject[]> = {
  me: meRoutes,
  team: teamRoutes,
  hr: hrRoutes,
  overview: overviewRoutes,
  admin: adminRoutes,
};

/** What exists: the pages of each workspace and which workspaces have a home. */
export interface Registry {
  routes: Record<WorkspaceId, RouteObject[]>;
  homes: Partial<Record<WorkspaceId, unknown>>;
}

const BUILT: Registry = { routes: WORKSPACE_ROUTES, homes: HOMES };

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === "string" && (WORKSPACE_IDS as string[]).includes(value);
}

/** The entries of a workspace that lead somewhere: its home once one is registered, the others once a route has their path. */
export function visibleNav(id: WorkspaceId, registry: Registry = BUILT): NavEntry[] {
  const workspace = WORKSPACES[id];
  return workspace.nav.filter((entry) => {
    if (entry.path === workspace.home) return Boolean(registry.homes[id]);
    const relative = entry.path.slice(workspace.home.length + 1);
    return registry.routes[id].some((route) => route.path === relative);
  });
}

/** The workspaces offered to a person: those their roles give and that have at least one page. */
export function availableWorkspaces(me: Pick<Me, "workspaces">, registry: Registry = BUILT): WorkspaceId[] {
  const granted = me.workspaces as readonly string[];
  return WORKSPACE_IDS.filter((id) => granted.includes(id) && visibleNav(id, registry).length > 0);
}

/** The workspace used last when it is still available, otherwise the most specific one (UI 3.2). */
export function landingWorkspace(me: Pick<Me, "workspaces" | "last_workspace">, registry: Registry = BUILT): WorkspaceId | null {
  const available = availableWorkspaces(me, registry);
  if (isWorkspaceId(me.last_workspace) && available.includes(me.last_workspace)) return me.last_workspace;
  return LANDING_ORDER.find((id) => available.includes(id)) ?? null;
}

export function workspaceOfPath(pathname: string): WorkspaceId | null {
  const first = pathname.split("/")[1];
  return isWorkspaceId(first) ? first : null;
}

function collect(routes: RouteObject[], prefix: string, out: string[]): void {
  for (const route of routes) {
    const path = route.path ? `${prefix}/${route.path}`.replace(/\/+/g, "/") : prefix;
    if (route.path) out.push(path);
    if (route.children) collect(route.children, path, out);
  }
}

/** Every registered address pattern, absolute. */
export function routePatterns(registry: Registry = BUILT, shared: RouteObject[] = sharedRoutes): string[] {
  const out = ["/", "/login", "/password/new"];
  collect(shared, "", out);
  for (const id of WORKSPACE_IDS) {
    out.push(`/${id}`);
    collect(registry.routes[id], `/${id}`, out);
  }
  return out;
}

/** The registered pattern an address falls under, the most specific first; "*" when there is none. */
export function patternFor(pathname: string, patterns: string[] = routePatterns()): string {
  const dynamicParts = (pattern: string) => pattern.split("/").filter((part) => part.startsWith(":") || part === "*").length;
  const matches = patterns.filter((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
  matches.sort((a, b) => dynamicParts(a) - dynamicParts(b));
  return matches[0] ?? "*";
}
```

- [ ] **Step 5: Write the test helpers**

`frontend/src/test/fixtures.ts`:

```ts
import { HttpResponse } from "msw";
import type { FieldProblem } from "@/api/problem";
import type { Me, Role } from "@/api/types";

const WORKSPACE_OF_ROLE: Record<Role, string> = { employee: "me", manager: "team", hr: "hr", exec: "overview", sysadmin: "admin" };

/** A signed-in user. Workspaces follow the roles unless given. */
export function makeMe(overrides: Partial<Me> = {}): Me {
  const roles = (overrides.roles ?? ["sysadmin"]) as Role[];
  return {
    public_id: "11111111-1111-4111-8111-111111111111",
    email: "sysadmin@impactrisks.com",
    name: "Samia Admin",
    language: "fr",
    roles,
    workspaces: roles.map((role) => WORKSPACE_OF_ROLE[role]),
    last_workspace: "",
    must_change_password: false,
    previous_login_at: "2026-10-04T08:15:00+01:00",
    password_reset: null,
    employee: null,
    environment: "development",
    version: "0.1.0",
    ...overrides,
  } as Me;
}

/** A page of a paginated list, as master 7.1 describes it. */
export function makePage<T>(results: T[], count: number = results.length) {
  return { count, next: null, previous: null, results };
}

/** An error answer in the problem format of master 6.2. */
export function problemResponse(status: number, code: string, detail: string, fields: Partial<FieldProblem>[] = []) {
  const entries = fields.length > 0 ? fields : [{ field: null }];
  const errors = entries.map((entry) => ({
    field: entry.field ?? null,
    code: entry.code ?? code,
    detail: entry.detail ?? detail,
    params: entry.params ?? {},
  }));
  return HttpResponse.json(
    { type: `urn:iris-hr:problem:${code}`, title: "Error", status, code, detail, errors, request_id: "req-test" },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
```

`frontend/src/test/render.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import type { Me } from "@/api/types";
import { patternFor } from "@/app/navigation";
import { Toaster } from "@/components/toast";
import { meKey, useMe } from "@/features/auth/api";
import { makeMe } from "./fixtures";

/** Stands in for RequireAuth: once the user is gone, so is the page. */
function SignedInOnly({ children }: { children: ReactElement }) {
  const me = useMe();
  return me.data ? children : <p data-testid="signed-out" />;
}

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/** Shown for any address other than the page under test, so a test can see where the page went. */
function Elsewhere() {
  const location = useLocation();
  return <p data-testid="elsewhere">{location.pathname + location.search}</p>;
}

interface RenderAppOptions {
  /** The address the page is opened at. */
  route?: string;
  /** Its route pattern. By default, the registered pattern that matches `route`. */
  path?: string;
  /** The signed-in user; null for nobody. */
  me?: Me | null;
  queryClient?: QueryClient;
}

/** Renders a page with the query client, a router and a signed-in user. */
export function renderApp(ui: ReactElement, options: RenderAppOptions = {}) {
  const { route = "/", queryClient = makeTestQueryClient() } = options;
  const me = options.me === undefined ? makeMe() : options.me;
  const path = options.path ?? patternFor(route.split(/[?#]/)[0]);
  queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      { path, element: me === null ? ui : <SignedInOnly>{ui}</SignedInOnly> },
      { path: "*", element: <Elsewhere /> },
    ],
    { initialEntries: [route] },
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
```

In `frontend/src/test/setup.ts` add the import and one line inside the existing `afterEach`:

```ts
import { resetSessionMemory } from "@/features/auth/session";
```

```ts
  resetSessionMemory();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/app src/features/auth src/test`
Expected: PASS, 3 files, 20 tests.

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0. If an icon name is not exported by the installed `lucide-react`, pick the icon with the same meaning at lucide.dev (older releases call `House` `Home`) and use it in `workspaces.ts`; nothing else depends on the name.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app frontend/src/workspaces frontend/src/features/auth frontend/src/test
git commit -m "feat(frontend): session hooks, the five workspaces and the navigation model"
```

---

### Task 9: Guards and the pages of UI 10.4

**Files:**
- Create: `frontend/src/components/NotAvailable.tsx`, `frontend/src/components/SomethingWentWrong.tsx`, `frontend/src/components/BeingUpdated.tsx`, `frontend/src/components/ProblemBoundary.tsx`
- Create: `frontend/src/app/guards.tsx`
- Modify: `frontend/src/components/index.ts`
- Test: `frontend/src/components/problems.test.tsx`, `frontend/src/app/guards.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `useCurrentUser`, `wasSignedOut` (Task 8); `availableWorkspaces` (Task 8); `ProblemError` (Task 2); `errors` texts (Task 3).
- Produces:
  - `NotAvailable()`, `SomethingWentWrong({ requestId?: string })`, `BeingUpdated({ onRetry: () => void })`: the three pages of UI 10.4.
  - `ProblemBoundary({ children, resetKey?: string })`: catches what a page throws. A `ProblemError` with status 403 or 404 shows `NotAvailable`; anything else shows `SomethingWentWrong` with the request reference. It resets when `resetKey` changes.
  - Convention for every page of the set: `if (query.isPending) return <PageLoading />; if (query.error) throw query.error;`. The shell wraps pages in `ProblemBoundary`, so a page never draws its own "not found".
  - `@/app/guards`: `safeNext(next: string | null): string | null`, `signInPath(location): string`, and the route elements `RequireAuth`, `RequirePasswordChange`, `RequireWorkspace({ id })`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/problems.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import { renderApp } from "@/test/render";
import { BeingUpdated } from "./BeingUpdated";
import { NotAvailable } from "./NotAvailable";
import { ProblemBoundary } from "./ProblemBoundary";
import { SomethingWentWrong } from "./SomethingWentWrong";

function Thrower({ error }: { error: unknown }): never {
  throw error;
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
});
```

`frontend/src/app/guards.test.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "@/api/types";
import { meKey } from "@/features/auth/api";
import { markSignedOut } from "@/features/auth/session";
import i18n from "@/i18n";
import { makeMe, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { RequireAuth, RequirePasswordChange, RequireWorkspace, safeNext } from "./guards";

// What exists in this test, whatever later plans add: Administration has one page, My team has none.
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [] }));
vi.mock("@/app/homes", () => ({ HOMES: {} }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** Opens an address behind the three guards. `me` undefined means "not loaded yet". */
function open(address: string, me: Me | null | undefined) {
  const queryClient = makeTestQueryClient();
  if (me !== undefined) queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      { path: "/login", element: <Where /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/password/new", element: <Where /> },
          {
            element: <RequirePasswordChange />,
            children: [
              { path: "/", element: <p>Accueil</p> },
              { path: "/admin", element: <RequireWorkspace id="admin" />, children: [{ path: "accounts", element: <p>Page des comptes</p> }] },
              { path: "/team", element: <RequireWorkspace id="team" />, children: [{ path: "people", element: <p>Page des personnes</p> }] },
            ],
          },
        ],
      },
    ],
    { initialEntries: [address] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe("safeNext", () => {
  it.each(["/admin/accounts", "/admin/accounts?state=locked&page=2", "/me", "/requests/abc#steps"])("keeps the inside address %s", (next) => {
    expect(safeNext(next)).toBe(next);
  });

  it.each([null, "", "admin", "//evil.example", "/\\evil.example", "https://evil.example/x", "javascript:alert(1)", "/login", "/login?next=/login"])(
    "refuses %s",
    (next) => {
      expect(safeNext(next)).toBeNull();
    },
  );
});

describe("RequireAuth", () => {
  it("sends an anonymous visitor to Sign in and remembers the page with its filters", () => {
    open("/admin/accounts?state=locked", null);
    expect(screen.getByTestId("where")).toHaveTextContent("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");
  });

  it("asks for no return when the visitor was on the root", () => {
    open("/", null);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/login$/);
  });

  it("asks for no return after a deliberate sign-out", () => {
    markSignedOut();
    open("/admin/accounts", null);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/login$/);
  });

  it("lets a signed-in user through", () => {
    open("/admin/accounts", makeMe());
    expect(screen.getByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'being updated' while the application is away, then carries on", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html>502</html>", { status: 502 })));
    open("/admin/accounts", undefined);
    expect(await screen.findByRole("heading", { name: "Mise à jour en cours" })).toBeInTheDocument();
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();

    server.use(http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe())));
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'something went wrong' with the reference when the session cannot be read", async () => {
    server.use(http.get("/api/v1/auth/me", () => problemResponse(500, "core.unexpected", "")));
    open("/admin/accounts", undefined);
    expect(await screen.findByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : req-test")).toBeInTheDocument();
  });

  it("switches to the language stored on the account", async () => {
    open("/admin/accounts", makeMe({ language: "en" }));
    await waitFor(() => expect(i18n.language).toBe("en"));
  });
});

describe("RequirePasswordChange", () => {
  it("lets nothing else be reached until the temporary password is replaced", () => {
    open("/admin/accounts", makeMe({ must_change_password: true }));
    expect(screen.getByTestId("where")).toHaveTextContent("/password/new");
    expect(screen.queryByText("Page des comptes")).not.toBeInTheDocument();
  });
});

describe("RequireWorkspace", () => {
  it("opens a workspace to its role", () => {
    open("/admin/accounts", makeMe({ roles: ["sysadmin"] }));
    expect(screen.getByText("Page des comptes")).toBeInTheDocument();
  });

  it("shows 'not available' to another role, without revealing the page", () => {
    open("/admin/accounts", makeMe({ roles: ["employee", "hr"] }));
    expect(screen.getByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
    expect(screen.queryByText("Page des comptes")).not.toBeInTheDocument();
  });

  it("shows 'not available' for a workspace that has no page yet, even to its role", () => {
    open("/team/people", makeMe({ roles: ["employee", "manager"] }));
    expect(screen.getByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/components/problems.test.tsx src/app/guards.test.tsx`
Expected: FAIL with `Failed to resolve import "./BeingUpdated"` and `"./guards"`.

- [ ] **Step 3: Write the three pages and the boundary**

`frontend/src/components/NotAvailable.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";

/** The page or item does not exist or is outside the user's reach. It never says which. */
export function NotAvailable() {
  const { t } = useTranslation();
  const me = useMe();

  useEffect(() => {
    document.title = `${t("errors:notAvailable.title")} · ${t("appName")}`;
  }, [t]);

  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:notAvailable.title")}</h1>
      <p className="text-body text-text-secondary">{t("errors:notAvailable.body")}</p>
      <Button asChild variant="primary" className="mt-2">
        <Link to={me.data ? "/" : "/login"}>{t("errors:notAvailable.back")}</Link>
      </Button>
    </div>
  );
}
```

`frontend/src/components/SomethingWentWrong.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

/** An unexpected error: a short message, the reference to quote, a way back. */
export function SomethingWentWrong({ requestId }: { requestId?: string }) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("errors:wentWrong.title")} · ${t("appName")}`;
  }, [t]);

  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:wentWrong.title")}</h1>
      <p className="text-body text-text-secondary">{t("errors:wentWrong.body")}</p>
      {requestId && <p className="tabular text-body font-medium text-foreground">{t("errors:wentWrong.reference", { id: requestId })}</p>}
      <Button asChild variant="primary" className="mt-2">
        <Link to="/">{t("errors:wentWrong.back")}</Link>
      </Button>
    </div>
  );
}
```

`frontend/src/components/BeingUpdated.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const CHECK_EVERY_MS = 15_000;

/** Shown while the application is restarting. It asks again by itself. */
export function BeingUpdated({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("errors:beingUpdated.title")} · ${t("appName")}`;
    const timer = setInterval(onRetry, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [onRetry, t]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{t("errors:beingUpdated.title")}</h1>
        <p className="text-body text-text-secondary">{t("errors:beingUpdated.body")}</p>
        <Button variant="primary" className="mt-2" onClick={onRetry}>
          {t("actions.retry")}
        </Button>
      </div>
    </main>
  );
}
```

`frontend/src/components/ProblemBoundary.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import { ProblemError } from "@/api/problem";
import { NotAvailable } from "./NotAvailable";
import { SomethingWentWrong } from "./SomethingWentWrong";

interface Props {
  children: ReactNode;
  /** When this changes (a new address), the boundary forgets the error. */
  resetKey?: string;
}

interface State {
  error: unknown;
  failed: boolean;
}

/** Catches what a page throws and shows the matching page of UI 10.4. */
export class ProblemBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null, failed: false });
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { error } = this.state;
    if (error instanceof ProblemError && (error.status === 403 || error.status === 404)) return <NotAvailable />;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }
}
```

Add to `frontend/src/components/index.ts`, keeping the list in alphabetical order:

```ts
export { BeingUpdated } from "./BeingUpdated";
export { NotAvailable } from "./NotAvailable";
export { ProblemBoundary } from "./ProblemBoundary";
export { SomethingWentWrong } from "./SomethingWentWrong";
```

- [ ] **Step 4: Write the guards**

`frontend/src/app/guards.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ProblemError } from "@/api/problem";
import { BeingUpdated } from "@/components/BeingUpdated";
import { NotAvailable } from "@/components/NotAvailable";
import { PageLoading } from "@/components/PageLoading";
import { SomethingWentWrong } from "@/components/SomethingWentWrong";
import { useCurrentUser, useMe } from "@/features/auth/api";
import { wasSignedOut } from "@/features/auth/session";
import { isLang, setLanguage } from "@/i18n";
import { availableWorkspaces } from "./navigation";
import type { WorkspaceId } from "./workspaces";

/** The address to return to after sign-in, or null when it would leave the application or loop. */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return null;
  return next;
}

/** Sign in, carrying the page the visitor was on, unless they signed out themselves. */
export function signInPath(location: { pathname: string; search: string }): string {
  const here = location.pathname + location.search;
  if (here === "/" || wasSignedOut()) return "/login";
  return `/login?next=${encodeURIComponent(here)}`;
}

/** Everything below needs a session. Also covers the application being away. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  const languageApplied = useRef(false);
  const user = me.data;

  useEffect(() => {
    // On a page load the language stored on the account wins over the browser's.
    if (user && !languageApplied.current) {
      languageApplied.current = true;
      if (isLang(user.language)) void setLanguage(user.language);
    }
  }, [user]);

  if (me.isPending) {
    return (
      <div className="p-6">
        <PageLoading />
      </div>
    );
  }
  if (user === undefined) {
    const error = me.error;
    if (error instanceof ProblemError && error.unavailable) return <BeingUpdated onRetry={() => void me.refetch()} />;
    return (
      <div className="p-6">
        <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />
      </div>
    );
  }
  if (user === null) return <Navigate to={signInPath(location)} replace />;
  return <Outlet />;
}

/** A user who signed in with a temporary password reaches nothing else until it is replaced. */
export function RequirePasswordChange() {
  const me = useCurrentUser();
  if (me.must_change_password) return <Navigate to="/password/new" replace />;
  return <Outlet />;
}

/** A workspace opens to the roles that have it; to anyone else it is "not available". */
export function RequireWorkspace({ id }: { id: WorkspaceId }) {
  const me = useCurrentUser();
  if (!availableWorkspaces(me).includes(id)) return <NotAvailable />;
  return <Outlet />;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/components/problems.test.tsx src/app/guards.test.tsx`
Expected: PASS, 2 files, 34 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components frontend/src/app/guards.tsx frontend/src/app/guards.test.tsx
git commit -m "feat(frontend): route guards and the not-available, error and being-updated pages"
```

---

### Task 10: Sign in

**Files:**
- Create: `frontend/src/features/auth/AuthCard.tsx`, `frontend/src/features/auth/SignInPage.tsx`, `frontend/src/features/shell/EnvironmentStrip.tsx`
- Create: `frontend/src/i18n/locales/fr/auth.json`, `frontend/src/i18n/locales/en/auth.json`
- Test: `frontend/src/features/auth/SignInPage.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `updateMe`, `completeSignIn`, `useMe`, `useHealth`, `rememberTemporaryPassword` (Task 8); `safeNext` (Task 9); `TextField`, `FormSummary`, `useProblemForm` (Task 7); `POST auth/login` and its error codes (master 7.2).
- Produces:
  - `SignInPage` (default export), mounted at `/login` by Task 15.
  - `AuthCard({ title: string; environment?: string; children: ReactNode })`: the centred card with the logo used by the pages outside the shell.
  - `EnvironmentStrip({ environment?: string })`: the "this is not production" strip, drawn only when `environment` is `"test"`.
  - The `auth` namespace, complete for Tasks 10 and 11.
- Server messages are shown as received (master 8.3): a problem with a field goes next to that input, any other goes above the form.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/auth.json`:

```json
{
  "signIn": {
    "title": "Sign in",
    "email": "Professional email",
    "password": "Password",
    "submit": "Sign in",
    "noReset": "Forgot your password? Ask the System Administrator to reset it."
  },
  "newPassword": {
    "title": "Choose a new password",
    "intro": "You signed in with a temporary password. Choose your own to continue.",
    "temporary": "Temporary password",
    "new": "New password",
    "confirmation": "Confirm the new password",
    "rules": "At least 12 characters, not a common password, and not similar to your name or your email.",
    "submit": "Save the password",
    "tooShort": "The password must have at least 12 characters.",
    "mismatch": "The two passwords are not the same.",
    "done": "Your password has been changed.",
    "signOut": "Sign out"
  },
  "changePassword": {
    "title": "Change password",
    "current": "Current password",
    "submit": "Change the password"
  },
  "notice": {
    "label": "About your sign-in",
    "previous": "Previous sign-in: {{when}}.",
    "first": "This is your first sign-in.",
    "reset": "Your password was reset by {{by}} on {{when}}.",
    "resetNoName": "Your password was reset on {{when}}."
  }
}
```

`frontend/src/i18n/locales/fr/auth.json`:

```json
{
  "signIn": {
    "title": "Connexion",
    "email": "Adresse e-mail professionnelle",
    "password": "Mot de passe",
    "submit": "Se connecter",
    "noReset": "Mot de passe oublié ? Demandez à l'administrateur système de le réinitialiser."
  },
  "newPassword": {
    "title": "Choisissez un nouveau mot de passe",
    "intro": "Vous êtes connecté avec un mot de passe temporaire. Choisissez le vôtre pour continuer.",
    "temporary": "Mot de passe temporaire",
    "new": "Nouveau mot de passe",
    "confirmation": "Confirmez le nouveau mot de passe",
    "rules": "Au moins 12 caractères, pas un mot de passe courant, et sans ressemblance avec votre nom ou votre adresse e-mail.",
    "submit": "Enregistrer le mot de passe",
    "tooShort": "Le mot de passe doit comporter au moins 12 caractères.",
    "mismatch": "Les deux mots de passe ne sont pas identiques.",
    "done": "Votre mot de passe a été modifié.",
    "signOut": "Se déconnecter"
  },
  "changePassword": {
    "title": "Changer le mot de passe",
    "current": "Mot de passe actuel",
    "submit": "Changer le mot de passe"
  },
  "notice": {
    "label": "À propos de votre connexion",
    "previous": "Connexion précédente : {{when}}.",
    "first": "C'est votre première connexion.",
    "reset": "Votre mot de passe a été réinitialisé par {{by}} le {{when}}.",
    "resetNoName": "Votre mot de passe a été réinitialisé le {{when}}."
  }
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/auth/SignInPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { temporaryPasswordInMemory } from "./session";
import SignInPage from "./SignInPage";

const EMAIL = "sysadmin@impactrisks.com";
const PASSWORD = "Correct-Horse-42!";

const open = (route = "/login") => renderApp(<SignInPage />, { route, me: null });

async function fillAndSend(user: UserEvent, email = EMAIL, password = PASSWORD) {
  await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), email);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
}

const accepts = (me = makeMe()) => http.post("/api/v1/auth/login", () => HttpResponse.json(me));

describe("SignInPage", () => {
  it("asks for the email, the password and the language, and says who resets passwords", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
    const languages = screen.getByRole("group", { name: "Langue" });
    expect(within(languages).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    expect(within(languages).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Mot de passe oublié ? Demandez à l'administrateur système de le réinitialiser.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("signs in, trims the email and returns to the page that was asked for", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/login", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeMe());
      }),
    );
    open("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");
    await fillAndSend(user, `  ${EMAIL} `);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts?state=locked");
    expect(body).toEqual({ email: EMAIL, password: PASSWORD });
  });

  it("goes to the root, which picks the landing workspace, when no page was asked for", async () => {
    const user = userEvent.setup();
    server.use(accepts());
    open();
    await fillAndSend(user);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
  });

  it.each(["%2F%2Fevil.example", "https%3A%2F%2Fevil.example%2Fx", "%2F%5Cevil.example", "%2Flogin"])(
    "ignores a next address that leaves the application (%s)",
    async (next) => {
      const user = userEvent.setup();
      server.use(accepts());
      open(`/login?next=${next}`);
      await fillAndSend(user);
      expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
    },
  );

  it.each([
    [400, "auth.invalid_credentials", "Adresse ou mot de passe incorrect."],
    [400, "auth.locked", "Compte verrouillé. Réessayez après 14:45."],
    [400, "auth.disabled", "Compte désactivé. Contactez l'administrateur système."],
    [400, "auth.temp_password_expired", "Mot de passe temporaire expiré. Demandez-en un nouveau à l'administrateur système."],
    [429, "auth.rate_limited", "Trop de tentatives depuis ce poste. Réessayez plus tard."],
  ])("shows the server's message for %i %s above the form and keeps what was typed", async (status, code, detail) => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/auth/login", () => problemResponse(status, code, detail)));
    open();
    await fillAndSend(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue(EMAIL);
    expect(screen.getByLabelText("Mot de passe")).toHaveValue(PASSWORD);
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("puts the refusal of another domain next to the email", async () => {
    const user = userEvent.setup();
    const detail = "Seules les adresses @impactrisks.com sont acceptées.";
    server.use(http.post("/api/v1/auth/login", () => problemResponse(400, "auth.domain_not_allowed", detail, [{ field: "email" }])));
    open();
    await fillAndSend(user, "sami@gmail.com");
    expect(await screen.findByRole("textbox", { name: "Adresse e-mail professionnelle", description: detail })).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps what was typed when the application cannot be reached", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/auth/login", () => HttpResponse.error()));
    open();
    await fillAndSend(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("L'application est injoignable. Vérifiez votre connexion et réessayez.");
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue(EMAIL);
    expect(screen.getByLabelText("Mot de passe")).toHaveValue(PASSWORD);
  });

  it("does not call the API while a field is empty", async () => {
    const user = userEvent.setup();
    const called = vi.fn();
    server.use(
      http.post("/api/v1/auth/login", () => {
        called();
        return HttpResponse.json(makeMe());
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(called).not.toHaveBeenCalled();
  });

  it("switches language at once and stores the choice on the account", async () => {
    const user = userEvent.setup();
    let patched: unknown;
    server.use(
      accepts(makeMe({ language: "fr" })),
      http.patch("/api/v1/auth/me", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(makeMe({ language: "en" }));
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Professional email"), EMAIL);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByTestId("elsewhere");
    expect(patched).toEqual({ language: "en" });
    expect(i18n.language).toBe("en");
  });

  it("adopts the account's language when the user did not choose one", async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    server.use(
      accepts(makeMe({ language: "en" })),
      http.patch("/api/v1/auth/me", () => {
        patch();
        return HttpResponse.json(makeMe({ language: "en" }));
      }),
    );
    open();
    await fillAndSend(user);
    await screen.findByTestId("elsewhere");
    expect(i18n.language).toBe("en");
    expect(patch).not.toHaveBeenCalled();
  });

  it("sends a temporary-password user to choose a new one, keeping the password in memory only", async () => {
    const user = userEvent.setup();
    server.use(accepts(makeMe({ must_change_password: true })));
    open("/login?next=%2Fadmin%2Faccounts");
    await fillAndSend(user, EMAIL, "Temp-0001-abcd");
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/password/new");
    expect(temporaryPasswordInMemory()).toBe("Temp-0001-abcd");
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie;
    expect(stored).not.toContain("Temp-0001-abcd");
  });

  it("sends a user who is already signed in away from the page", () => {
    renderApp(<SignInPage />, { route: "/login?next=%2Fadmin%2Faccounts", me: makeMe() });
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/admin/accounts");
  });

  it("marks the test stack", async () => {
    server.use(http.get("/api/v1/health", () => HttpResponse.json({ status: "ok", app: "ok", database: "ok", worker: "ok", version: "0.1.0", environment: "test" })));
    open();
    expect(await screen.findByText("Environnement de test. Ceci n'est pas la production.")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Connexion · IRIS HR"));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/auth/SignInPage.test.tsx`
Expected: FAIL with `Failed to resolve import "./SignInPage"`.

- [ ] **Step 4: Write the strip, the card and the page**

`frontend/src/features/shell/EnvironmentStrip.tsx`:

```tsx
import { useTranslation } from "react-i18next";

/** On the test stack only: a visible sign that this is not production. */
export function EnvironmentStrip({ environment }: { environment?: string }) {
  const { t } = useTranslation();
  if (environment !== "test") return null;
  return (
    <p role="note" className="bg-[var(--env-test-bg)] px-4 py-1 text-center text-caption font-medium text-[var(--env-test)]">
      {t("testEnvironment")}
    </p>
  );
}
```

`frontend/src/features/auth/AuthCard.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import logo from "@/assets/iris-logo.png";
import { EnvironmentStrip } from "@/features/shell/EnvironmentStrip";

interface AuthCardProps {
  title: string;
  environment?: string;
  children: ReactNode;
}

/** The centred card of the pages outside the shell: Sign in and Choose a new password. */
export function AuthCard({ title, environment, children }: AuthCardProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("appName")}`;
  }, [title, t]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <EnvironmentStrip environment={environment} />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
          <img src={logo} alt={t("appName")} className="mb-6 h-10 w-auto" />
          <h1 className="mb-6 text-title font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
```

`frontend/src/features/auth/SignInPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router";
import { z } from "zod";
import { safeNext } from "@/app/guards";
import { FormSummary } from "@/components/FormSummary";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { isLang, LANGUAGES, setLanguage, useLang } from "@/i18n";
import { completeSignIn, signIn, updateMe, useHealth, useMe } from "./api";
import { AuthCard } from "./AuthCard";
import { rememberTemporaryPassword } from "./session";

interface SignInValues {
  email: string;
  password: string;
}

export default function SignInPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const queryClient = useQueryClient();
  const me = useMe();
  const health = useHealth();
  const [params] = useSearchParams();
  const [languageChosen, setLanguageChosen] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("form.required")),
        password: z.string().min(1, t("form.required")),
      }),
    [t],
  );
  const form = useForm<SignInValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;

  if (me.data) {
    const destination = me.data.must_change_password ? "/password/new" : (safeNext(params.get("next")) ?? "/");
    return <Navigate to={destination} replace />;
  }

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      let user = await signIn(values);
      if (user.must_change_password) rememberTemporaryPassword(values.password);
      if (languageChosen && user.language !== lang) {
        try {
          user = await updateMe({ language: lang });
        } catch {
          // Signed in all the same; the language can be changed again from the shell.
        }
      } else if (isLang(user.language)) {
        await setLanguage(user.language);
      }
      completeSignIn(queryClient, user);
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <AuthCard title={t("auth:signIn.title")} environment={health.data?.environment}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          // A second click while the first is on its way does nothing.
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        <TextField control={form.control} name="email" label={t("auth:signIn.email")} type="email" inputMode="email" autoComplete="username" />
        <TextField control={form.control} name="password" label={t("auth:signIn.password")} type="password" autoComplete="current-password" />
        <div role="group" aria-label={t("language.label")} className="flex gap-2">
          {LANGUAGES.map((code) => (
            <Button
              key={code}
              size="sm"
              variant={code === lang ? "secondary" : "ghost"}
              aria-pressed={code === lang}
              onClick={() => {
                setLanguageChosen(true);
                void setLanguage(code);
              }}
            >
              {t(`language.${code}`)}
            </Button>
          ))}
        </div>
        <Button type="submit" variant="primary" aria-busy={sending}>
          {t("auth:signIn.submit")}
        </Button>
      </form>
      <p className="mt-6 text-caption text-muted-foreground">{t("auth:signIn.noReset")}</p>
    </AuthCard>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/auth/SignInPage.test.tsx`
Expected: PASS, 1 file, 20 tests.

If TypeScript rejects `zodResolver(schema)` against `useForm<SignInValues>`, the installed `@hookform/resolvers` predates zod 4 support: run `docker compose run --rm web npm install '@hookform/resolvers@latest'` and try again. If `health.data?.environment` is typed as `unknown`, the health serializer of plan 01a lacks its `@extend_schema`; fix it there and regenerate the types.

- [ ] **Step 6: Check lint, types and parity, then commit**

Run: `docker compose run --rm web npm run lint`, `docker compose run --rm web npm run typecheck` and `docker compose run --rm web npx vitest run src/i18n/parity.test.ts`
Expected: all three succeed; parity now also covers `auth`.

```bash
git add frontend/src/features frontend/src/i18n/locales
git commit -m "feat(frontend): sign-in page with every refusal message and a safe return address"
```

---

### Task 11: Choose a new password, change password, the after-sign-in notice

**Files:**
- Create: `frontend/src/features/auth/passwordSchema.ts`, `frontend/src/features/auth/ChooseNewPasswordPage.tsx`, `frontend/src/features/auth/ChangePasswordPage.tsx`, `frontend/src/features/auth/AfterSignInNotice.tsx`
- Modify: `frontend/src/app/sharedRoutes.tsx`
- Test: `frontend/src/features/auth/passwords.test.tsx`, `frontend/src/features/auth/AfterSignInNotice.test.tsx`

**Interfaces:**
- Consumes: `useCurrentUser`, `useChangePassword`, `useLogout`, the session memory (Task 8); `AuthCard` and the `auth` texts (Task 10); `PageHeader`, `TextField`, `FormSummary`, `useProblemForm`, `toast` (Tasks 5 and 7); `formatDateTime` (Task 3); `POST auth/password` with `auth.wrong_current_password` and `auth.weak_password` (master 7.2).
- Produces:
  - `ChooseNewPasswordPage` (default export), mounted at `/password/new` outside the shell by Task 15. It sends the temporary password typed at sign-in as `current_password`, and asks for it again only when the page was reloaded.
  - `ChangePasswordPage` (default export), registered at `/password` in `sharedRoutes`.
  - `AfterSignInNotice()`: shown by the shell once per sign-in.
  - `passwordSchema(t)` and `PasswordValues`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/auth/passwords.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import ChangePasswordPage from "./ChangePasswordPage";
import ChooseNewPasswordPage from "./ChooseNewPasswordPage";
import { rememberTemporaryPassword, temporaryPasswordInMemory } from "./session";

const TEMPORARY = "Temp-0001-abcd";
const NEW = "Correct-Horse-42!";
const RULES = "Au moins 12 caractères, pas un mot de passe courant, et sans ressemblance avec votre nom ou votre adresse e-mail.";

const noContent = () => new HttpResponse(null, { status: 204 });
const openChoose = () => renderApp(<ChooseNewPasswordPage />, { route: "/password/new", me: makeMe({ must_change_password: true }) });

describe("ChooseNewPasswordPage", () => {
  it("asks only for the new password while the temporary one is still in memory", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ must_change_password: false }))),
    );
    openChoose();
    expect(screen.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Mot de passe temporaire")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAccessibleDescription(RULES);

    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(/^\/$/);
    expect(body).toEqual({ current_password: TEMPORARY, new_password: NEW });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Votre mot de passe a été modifié."));
    expect(temporaryPasswordInMemory()).toBeNull();
  });

  it("asks for the temporary password again after a reload", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ must_change_password: false }))),
    );
    openChoose();
    await user.type(screen.getByLabelText("Mot de passe temporaire"), TEMPORARY);
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await screen.findByTestId("elsewhere");
    expect(body).toEqual({ current_password: TEMPORARY, new_password: NEW });
  });

  it("refuses a short password and a different confirmation before calling the API", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const called = vi.fn();
    server.use(
      http.post("/api/v1/auth/password", () => {
        called();
        return noContent();
      }),
    );
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "court");
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), "autre");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Le mot de passe doit comporter au moins 12 caractères.")).toBeInTheDocument();
    expect(screen.getByText("Les deux mots de passe ne sont pas identiques.")).toBeInTheDocument();
    expect(called).not.toHaveBeenCalled();
  });

  it("shows the server's refusal next to the new password and keeps what was typed", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const detail = "Ce mot de passe est trop courant.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.weak_password", detail, [{ field: "new_password" }])));
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "motdepasse1234");
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), "motdepasse1234");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await waitFor(() => expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAccessibleDescription(`${RULES} ${detail}`));
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("motdepasse1234");
  });

  it("shows a refused temporary password above the form when its field is not on the page", async () => {
    const user = userEvent.setup();
    rememberTemporaryPassword(TEMPORARY);
    const detail = "Le mot de passe actuel est incorrect.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.wrong_current_password", detail, [{ field: "current_password" }])));
    openChoose();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
  });

  it("sends away a user who has nothing to change", () => {
    renderApp(<ChooseNewPasswordPage />, { route: "/password/new", me: makeMe({ must_change_password: false }) });
    expect(screen.getByTestId("elsewhere")).toHaveTextContent(/^\/$/);
  });

  it("offers to sign out, since nothing else is reachable", async () => {
    server.use(http.post("/api/v1/auth/logout", noContent));
    openChoose();
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(await screen.findByTestId("signed-out")).toBeInTheDocument();
  });
});

describe("ChangePasswordPage", () => {
  it("changes the password, says so and empties the form", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/auth/password", async ({ request }) => {
        body = await request.json();
        return noContent();
      }),
      http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe())),
    );
    renderApp(<ChangePasswordPage />, { route: "/password" });
    expect(screen.getByRole("heading", { level: 1, name: "Changer le mot de passe" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Mot de passe actuel"), "Ancien-Mot-2025!");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Votre mot de passe a été modifié."));
    expect(body).toEqual({ current_password: "Ancien-Mot-2025!", new_password: NEW });
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("");
  });

  it("puts a wrong current password next to its field", async () => {
    const user = userEvent.setup();
    const detail = "Le mot de passe actuel est incorrect.";
    server.use(http.post("/api/v1/auth/password", () => problemResponse(400, "auth.wrong_current_password", detail, [{ field: "current_password" }])));
    renderApp(<ChangePasswordPage />, { route: "/password" });
    await user.type(screen.getByLabelText("Mot de passe actuel"), "Faux-Mot-2025!");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), NEW);
    await user.type(screen.getByLabelText("Confirmez le nouveau mot de passe"), NEW);
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    await waitFor(() => expect(screen.getByLabelText("Mot de passe actuel")).toHaveAccessibleDescription(detail));
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue(NEW);
  });
});
```

`frontend/src/features/auth/AfterSignInNotice.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { AfterSignInNotice } from "./AfterSignInNotice";
import { markSignedIn, signInNoticePending } from "./session";

const text = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("AfterSignInNotice", () => {
  it("shows the previous sign-in, and who reset the password, once per sign-in", async () => {
    markSignedIn();
    const me = makeMe({
      previous_login_at: "2026-10-04T08:15:00+01:00",
      password_reset: { by: "Samia Admin", at: "2026-10-05T09:00:00+01:00" },
    });
    const first = renderApp(<AfterSignInNotice />, { me });
    const notice = screen.getByRole("complementary", { name: "À propos de votre connexion" });
    expect(text(notice)).toContain("Connexion précédente : 4 oct. 2026 à 08:15.");
    expect(text(notice)).toContain("Votre mot de passe a été réinitialisé par Samia Admin le 5 oct. 2026 à 09:00.");
    expect(signInNoticePending()).toBe(false);

    first.unmount();
    renderApp(<AfterSignInNotice />, { me });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("still says that the password was reset when the name of who did it is not known", () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />, { me: makeMe({ password_reset: { by: null, at: "2026-10-05T09:00:00+01:00" } }) });
    expect(text(screen.getByRole("complementary"))).toContain("Votre mot de passe a été réinitialisé le 5 oct. 2026 à 09:00.");
  });

  it("says so on a first sign-in", () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />, { me: makeMe({ previous_login_at: null }) });
    expect(screen.getByRole("complementary")).toHaveTextContent("C'est votre première connexion.");
  });

  it("can be closed", async () => {
    markSignedIn();
    renderApp(<AfterSignInNotice />);
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows nothing on a page load without a sign-in", () => {
    renderApp(<AfterSignInNotice />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/auth/passwords.test.tsx src/features/auth/AfterSignInNotice.test.tsx`
Expected: FAIL with `Failed to resolve import "./ChangePasswordPage"` and `"./AfterSignInNotice"`.

- [ ] **Step 3: Write the schema and the two pages**

`frontend/src/features/auth/passwordSchema.ts`:

```ts
import type { TFunction } from "i18next";
import { z } from "zod";

export interface PasswordValues {
  current_password: string;
  new_password: string;
  confirmation: string;
}

export const EMPTY_PASSWORDS: PasswordValues = { current_password: "", new_password: "", confirmation: "" };

/** The checks the browser can make. The server makes them again, and more (common passwords, similarity). */
export function passwordSchema(t: TFunction) {
  return z
    .object({
      current_password: z.string().min(1, t("form.required")),
      new_password: z.string().min(12, t("auth:newPassword.tooShort")),
      confirmation: z.string().min(1, t("form.required")),
    })
    .refine((values) => values.new_password === values.confirmation, {
      path: ["confirmation"],
      message: t("auth:newPassword.mismatch"),
    });
}
```

`frontend/src/features/auth/ChooseNewPasswordPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { FormSummary } from "@/components/FormSummary";
import { TextField } from "@/components/TextField";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { useChangePassword, useCurrentUser, useLogout } from "./api";
import { AuthCard } from "./AuthCard";
import { passwordSchema, type PasswordValues } from "./passwordSchema";
import { forgetTemporaryPassword, temporaryPasswordInMemory } from "./session";

export default function ChooseNewPasswordPage() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const change = useChangePassword();
  const logout = useLogout();
  // Typed a moment ago at Sign in; after a reload it is gone and the page asks for it.
  const [remembered] = useState(() => temporaryPasswordInMemory());

  const schema = useMemo(() => passwordSchema(t), [t]);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: remembered ?? "", new_password: "", confirmation: "" },
  });
  const problems = useProblemForm(form, {
    mapField: (field) => (field === "current_password" && remembered !== null ? null : field),
  });
  const sending = form.formState.isSubmitting;

  if (!me.must_change_password) return <Navigate to="/" replace />;

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      await change.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      forgetTemporaryPassword();
      toast(t("auth:newPassword.done"));
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <AuthCard title={t("auth:newPassword.title")} environment={me.environment}>
      <p className="mb-4 text-body text-text-secondary">{t("auth:newPassword.intro")}</p>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        {remembered === null && (
          <TextField control={form.control} name="current_password" label={t("auth:newPassword.temporary")} type="password" autoComplete="current-password" />
        )}
        <TextField control={form.control} name="new_password" label={t("auth:newPassword.new")} hint={t("auth:newPassword.rules")} type="password" autoComplete="new-password" />
        <TextField control={form.control} name="confirmation" label={t("auth:newPassword.confirmation")} type="password" autoComplete="new-password" />
        <Button type="submit" variant="primary" aria-busy={sending}>
          {t("auth:newPassword.submit")}
        </Button>
      </form>
      <div className="mt-6">
        <Button variant="link" size="inline" onClick={() => logout.mutate()}>
          {t("auth:newPassword.signOut")}
        </Button>
      </div>
    </AuthCard>
  );
}
```

`frontend/src/features/auth/ChangePasswordPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormSummary } from "@/components/FormSummary";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { useChangePassword } from "./api";
import { EMPTY_PASSWORDS, passwordSchema, type PasswordValues } from "./passwordSchema";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const schema = useMemo(() => passwordSchema(t), [t]);
  const form = useForm<PasswordValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_PASSWORDS });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      await change.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      form.reset(EMPTY_PASSWORDS);
      toast(t("auth:newPassword.done"));
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <div className="max-w-md">
      <PageHeader title={t("auth:changePassword.title")} />
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        <TextField control={form.control} name="current_password" label={t("auth:changePassword.current")} type="password" autoComplete="current-password" />
        <TextField control={form.control} name="new_password" label={t("auth:newPassword.new")} hint={t("auth:newPassword.rules")} type="password" autoComplete="new-password" />
        <TextField control={form.control} name="confirmation" label={t("auth:newPassword.confirmation")} type="password" autoComplete="new-password" />
        <div>
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t("auth:changePassword.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write the notice and register the page**

`frontend/src/features/auth/AfterSignInNotice.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useCurrentUser } from "./api";
import { clearSignInNotice, signInNoticePending } from "./session";

/** Once per sign-in: when the user last signed in and, if it happened, who reset their password (ACC-07). */
export function AfterSignInNotice() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const [visible, setVisible] = useState(() => signInNoticePending());

  useEffect(() => {
    clearSignInNotice();
  }, []);

  if (!visible) return null;
  return (
    <aside
      aria-label={t("auth:notice.label")}
      className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[var(--info-border)] bg-info-bg px-4 py-3 text-body text-info"
    >
      <div className="flex flex-col gap-1">
        <p>{me.previous_login_at ? t("auth:notice.previous", { when: formatDateTime(me.previous_login_at, lang) }) : t("auth:notice.first")}</p>
        {me.password_reset && (
          <p>
            {me.password_reset.by
              ? t("auth:notice.reset", { by: me.password_reset.by, when: formatDateTime(me.password_reset.at, lang) })
              : t("auth:notice.resetNoName", { when: formatDateTime(me.password_reset.at, lang) })}
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
        {t("actions.close")}
      </Button>
    </aside>
  );
}
```

Replace `frontend/src/app/sharedRoutes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const ChangePasswordPage = lazy(() => import("@/features/auth/ChangePasswordPage"));

// Pages inside the shell that belong to no workspace, with absolute paths.
// A plan adds a page by appending an element to this array.
export const sharedRoutes: RouteObject[] = [{ path: "/password", element: <ChangePasswordPage /> }];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/auth`
Expected: PASS, 4 files (`api`, `SignInPage`, `passwords`, `AfterSignInNotice`), with 9 tests in `passwords.test.tsx` and 5 in `AfterSignInNotice.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth frontend/src/app/sharedRoutes.tsx
git commit -m "feat(frontend): choose a new password, change password and the after-sign-in notice"
```

---

### Task 12: Notifications

**Files:**
- Create: `frontend/src/features/notifications/api.ts`, `frontend/src/features/notifications/NotificationsBell.tsx`, `frontend/src/features/notifications/NotificationsPage.tsx`
- Create: `frontend/src/i18n/locales/fr/notifications.json`, `frontend/src/i18n/locales/en/notifications.json`
- Modify: `frontend/src/app/sharedRoutes.tsx`
- Test: `frontend/src/features/notifications/notifications.test.tsx`

**Interfaces:**
- Consumes: the endpoints of master 7.5 (`notifications`, `notifications/unread-count`, `notifications/{id}/read`, `notifications/read-all`); `Popover` (Task 4); `PageHeader`, `EmptyState`, `StatusBadge`, `Pager`, `FilterBar`, `useListParams` (Tasks 5 and 6); `formatDateTime` (Task 3).
- Produces:
  - `notificationKeys`, `useUnreadCount()` (the number, refreshed every minute), `useNotifications({ unread, page, pageSize }, enabled?)`, `useMarkRead()`, `useMarkAllRead()` from `@/features/notifications/api`.
  - `NotificationsBell({ compact?: boolean })`: the count across all workspaces and the latest five, for the shell.
  - `NotificationsPage` (default export), registered at `/notifications` in `sharedRoutes`.
  - `isInsideLink(link: string): boolean`: a notification link is followed only when it stays inside the application.
- A notification's `title` and `body` come from the server in the reader's language and are shown as received.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/notifications.json`:

```json
{
  "title": "Notifications",
  "bell": {
    "none": "Notifications",
    "unread": "Notifications, {{total}} unread"
  },
  "latest": "Latest notifications",
  "seeAll": "See all notifications",
  "empty": "You have no notification.",
  "emptyUnread": "You have read everything.",
  "unreadOnly": "Unread only",
  "unread": "Unread",
  "markRead": "Mark as read",
  "markReadOf": "Mark as read: {{title}}",
  "markAllRead": "Mark all as read",
  "openOf": "Open: {{title}}"
}
```

`frontend/src/i18n/locales/fr/notifications.json`:

```json
{
  "title": "Notifications",
  "bell": {
    "none": "Notifications",
    "unread": "Notifications, {{total}} non lues"
  },
  "latest": "Dernières notifications",
  "seeAll": "Voir toutes les notifications",
  "empty": "Vous n'avez aucune notification.",
  "emptyUnread": "Vous avez tout lu.",
  "unreadOnly": "Non lues uniquement",
  "unread": "Non lue",
  "markRead": "Marquer comme lue",
  "markReadOf": "Marquer comme lue : {{title}}",
  "markAllRead": "Tout marquer comme lu",
  "openOf": "Ouvrir : {{title}}"
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/notifications/notifications.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { Notification } from "@/api/types";
import { makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
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
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 non lues" }));
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
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 non lues" }));
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/notifications`
Expected: FAIL with `Failed to resolve import "./NotificationsBell"`.

- [ ] **Step 4: Write the hooks**

`frontend/src/features/notifications/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { Notification } from "@/api/types";

interface ListParams {
  unread: boolean;
  page: number;
  pageSize: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread-count"] as const,
  list: (params: ListParams) => ["notifications", "list", params] as const,
};

/** A notification link is followed only when it stays inside the application. */
export function isInsideLink(link: string): boolean {
  return link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\");
}

/** Unread notifications across all workspaces, refreshed every minute. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => call(api.GET("/api/v1/notifications/unread-count")),
    select: (data) => data.count,
    refetchInterval: 60_000,
  });
}

export function useNotifications(params: ListParams, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () =>
      call(
        api.GET("/api/v1/notifications", {
          // The API reads `unread=true` as it reads `unread=1`.
          params: { query: { page: params.page, page_size: params.pageSize, ...(params.unread ? { unread: true } : {}) } },
        }),
      ),
    enabled,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Notification["id"]) => call(api.POST("/api/v1/notifications/{id}/read", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST("/api/v1/notifications/read-all")),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
```

- [ ] **Step 5: Write the bell and the page**

`frontend/src/features/notifications/NotificationsBell.tsx`:

```tsx
import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { Notification } from "@/api/types";
import { PageLoading } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isInsideLink, useMarkRead, useNotifications, useUnreadCount } from "./api";

/** The unread count across all workspaces; opens the latest five (UI 3.3). */
export function NotificationsBell({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const latest = useNotifications({ unread: false, page: 1, pageSize: 5 }, open);
  const markRead = useMarkRead();

  const count = unread.data ?? 0;
  const rows = latest.data?.results ?? [];

  function openItem(item: Notification): void {
    setOpen(false);
    if (!item.read_at) markRead.mutate(item.id);
    if (isInsideLink(item.link)) navigate(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          className={compact ? "relative" : "w-full justify-start"}
          aria-label={count > 0 ? t("notifications:bell.unread", { total: count }) : t("notifications:bell.none")}
        >
          <Bell aria-hidden="true" />
          {!compact && <span>{t("notifications:title")}</span>}
          {count > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "tabular rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground",
                compact ? "absolute -right-1 -top-1" : "ml-auto",
              )}
            >
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("notifications:latest")} side={compact ? "bottom" : "right"} align="end">
        <p className="px-2 py-1 text-caption font-medium text-muted-foreground">{t("notifications:latest")}</p>
        {latest.isPending && <PageLoading />}
        {!latest.isPending && rows.length === 0 && <p className="px-2 py-3 text-body text-muted-foreground">{t("notifications:empty")}</p>}
        {rows.length > 0 && (
          <ul className="flex flex-col">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                >
                  <span className={cn("text-body text-foreground", !item.read_at && "font-semibold")}>{item.title}</span>
                  <span className="text-caption text-muted-foreground">{item.body}</span>
                  <span className="text-caption text-muted-foreground">{formatDateTime(item.created_at, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 border-t border-divider px-2 pt-2 pb-1">
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-body font-semibold text-primary hover:underline">
            {t("notifications:seeAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

`frontend/src/features/notifications/NotificationsPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { Notification } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { isInsideLink, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from "./api";

const PAGE_SIZE = 25;

/** One list for the person, across all their workspaces (UI 10.1). */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const list = useListParams({ unread: "" });
  const unreadOnly = list.filters.unread === "1";
  const query = useNotifications({ unread: unreadOnly, page: list.page, pageSize: PAGE_SIZE });
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  if (query.error) throw query.error;
  const rows = query.data?.results ?? [];

  function openItem(item: Notification): void {
    if (!item.read_at) markRead.mutate(item.id);
    navigate(item.link);
  }

  return (
    <>
      <PageHeader
        title={t("notifications:title")}
        primary={
          (unread.data ?? 0) > 0 ? (
            <Button variant="primary" onClick={() => markAll.mutate()}>
              {t("notifications:markAllRead")}
            </Button>
          ) : undefined
        }
      />
      <FilterBar>
        <Button variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => list.setFilter("unread", unreadOnly ? "" : "1")}>
          {t("notifications:unreadOnly")}
        </Button>
      </FilterBar>
      {query.isPending && <PageLoading />}
      {!query.isPending && rows.length === 0 && <EmptyState title={unreadOnly ? t("notifications:emptyUnread") : t("notifications:empty")} />}
      {rows.length > 0 && (
        <ul aria-label={t("notifications:title")} className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
                  <span>{item.title}</span>
                  {!item.read_at && <StatusBadge tone="info">{t("notifications:unread")}</StatusBadge>}
                </p>
                <p className="text-body text-text-secondary">{item.body}</p>
                <p className="mt-1 text-caption text-muted-foreground">{formatDateTime(item.created_at, lang)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!item.read_at && (
                  <Button size="sm" variant="ghost" aria-label={t("notifications:markReadOf", { title: item.title })} onClick={() => markRead.mutate(item.id)}>
                    {t("notifications:markRead")}
                  </Button>
                )}
                {isInsideLink(item.link) && (
                  <Button size="sm" aria-label={t("notifications:openOf", { title: item.title })} onClick={() => openItem(item)}>
                    {t("actions.open")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageSize={PAGE_SIZE} total={query.data?.count ?? 0} onPage={list.setPage} />
    </>
  );
}
```

Replace `frontend/src/app/sharedRoutes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const ChangePasswordPage = lazy(() => import("@/features/auth/ChangePasswordPage"));
const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage"));

// Pages inside the shell that belong to no workspace, with absolute paths.
// A plan adds a page by appending an element to this array.
export const sharedRoutes: RouteObject[] = [
  { path: "/password", element: <ChangePasswordPage /> },
  { path: "/notifications", element: <NotificationsPage /> },
];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/notifications src/i18n/parity.test.ts`
Expected: PASS; `notifications.test.tsx` has 8 tests, and parity now covers `notifications`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/notifications frontend/src/i18n/locales frontend/src/app/sharedRoutes.tsx
git commit -m "feat(frontend): notification bell and the notifications page"
```

---

### Task 13: Shell controls: navigation, workspace switcher, language, user menu

**Files:**
- Create: `frontend/src/features/shell/workspaceCounts.ts`, `useCurrentWorkspace.ts`, `useChangeLanguage.ts`, `NavList.tsx`, `WorkspaceSwitcher.tsx`, `LanguageSwitch.tsx`, `UserMenu.tsx` (all in `frontend/src/features/shell/`)
- Create: `frontend/src/i18n/locales/fr/shell.json`, `frontend/src/i18n/locales/en/shell.json`
- Test: `frontend/src/features/shell/controls.test.tsx`

**Interfaces:**
- Consumes: `visibleNav`, `availableWorkspaces`, `landingWorkspace`, `workspaceOfPath` (Task 8); `useCurrentUser`, `useUpdateMe`, `useLogout` (Task 8); `DropdownMenu` and `Button` (Task 4); `nav` and `common` texts (Task 3).
- Produces:
  - `useWorkspaceCounts(): Partial<Record<WorkspaceId, number>>` from `@/features/shell/workspaceCounts`. It returns `{}` here; **plan 05 replaces this file** with one that reads `workspaces/summary`.
  - `useCurrentWorkspace(): WorkspaceId | null`: the workspace of the address, or the landing workspace on a page that belongs to none.
  - `useChangeLanguage(): (lang: Lang) => void`: switches at once, stores the choice on the account, and fetches again whatever the server wrote in the other language.
  - `NavList({ workspace: WorkspaceId; variant: "sidebar" | "tabs" })`, `WorkspaceSwitcher({ current: WorkspaceId | null })` (renders nothing for a person with one workspace), `LanguageSwitch()`, `UserMenu({ compact?: boolean; withLanguage?: boolean })`.
  - The `shell` namespace.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/shell.json`:

```json
{
  "navigation": "Navigation",
  "workspace": {
    "switch": "Change workspace",
    "current": "Workspace: {{name}}",
    "currentWaiting": "Workspace: {{name}}. {{total}} waiting in your other workspaces",
    "waiting": "{{name}}, {{total}} waiting"
  },
  "userMenu": {
    "label": "Menu of {{name}}",
    "changePassword": "Change password",
    "signOut": "Sign out"
  },
  "noWorkspace": {
    "title": "Nothing here yet",
    "body": "Your account gives access to no workspace yet. Contact the System Administrator."
  }
}
```

`frontend/src/i18n/locales/fr/shell.json`:

```json
{
  "navigation": "Navigation",
  "workspace": {
    "switch": "Changer d'espace",
    "current": "Espace : {{name}}",
    "currentWaiting": "Espace : {{name}}. {{total}} en attente dans vos autres espaces",
    "waiting": "{{name}}, {{total}} en attente"
  },
  "userMenu": {
    "label": "Menu de {{name}}",
    "changePassword": "Changer le mot de passe",
    "signOut": "Se déconnecter"
  },
  "noWorkspace": {
    "title": "Rien ici pour l'instant",
    "body": "Votre compte ne donne accès à aucun espace pour l'instant. Contactez l'administrateur système."
  }
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/shell/controls.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { wasSignedOut } from "@/features/auth/session";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { makeTestQueryClient, renderApp } from "@/test/render";
import { server } from "@/test/server";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavList } from "./NavList";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

// What exists in this test: Administration has a home and two pages, My team and My space one page each.
vi.mock("@/app/homes", () => ({ HOMES: { admin: () => null } }));
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }, { path: "parameters", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [{ path: "people", element: null }] }));
vi.mock("@/workspaces/me/routes", () => ({ meRoutes: [{ path: "profile", element: null }] }));
vi.mock("./workspaceCounts", () => ({ useWorkspaceCounts: () => ({ team: 3 }) }));

const several = makeMe({ name: "Samia Admin", roles: ["employee", "manager", "sysadmin"] });

const patches = (seen: unknown[]) =>
  http.patch("/api/v1/auth/me", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    seen.push(body);
    return HttpResponse.json({ ...several, ...body });
  });

describe("NavList", () => {
  it("shows only the entries that have a page, and marks the current one", () => {
    renderApp(<NavList workspace="admin" variant="sidebar" />, { route: "/admin/accounts" });
    const nav = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["État", "Comptes", "Paramètres"]);
    expect(within(nav).getByRole("link", { name: "Comptes" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "État" })).not.toHaveAttribute("aria-current");
    expect(within(nav).queryByRole("link", { name: "Journal de sécurité" })).not.toBeInTheDocument();
  });

  it("offers the same entries as tabs on a phone", () => {
    renderApp(<NavList workspace="admin" variant="tabs" />, { route: "/admin" });
    const nav = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin", "/admin/accounts", "/admin/parameters"]);
    expect(within(nav).getByRole("link", { name: "État" })).toHaveAttribute("aria-current", "page");
  });
});

describe("WorkspaceSwitcher", () => {
  it("is absent for a person with a single workspace", () => {
    const { container } = renderApp(<WorkspaceSwitcher current="admin" />, { route: "/admin", me: makeMe({ roles: ["sysadmin"] }) });
    expect(container.querySelector("button")).toBeNull();
  });

  it("lists the person's workspaces with what is waiting in each, and switches", async () => {
    const user = userEvent.setup();
    renderApp(<WorkspaceSwitcher current="admin" />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Espace : Administration. 3 en attente dans vos autres espaces" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(["Mon espace", "Mon équipe, 3 en attente", "Administration"]);
    await user.click(screen.getByRole("menuitem", { name: "Mon équipe, 3 en attente" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/team");
  });
});

describe("LanguageSwitch", () => {
  it("changes at once, stores the choice on the account and fetches server texts again", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    server.use(patches(seen));
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(["notifications", "unread-count"], { count: 1 });
    renderApp(<LanguageSwitch />, { route: "/admin", me: several, queryClient });
    const group = screen.getByRole("group", { name: "Langue" });
    expect(within(group).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(group).getByRole("button", { name: "English" }));
    expect(await screen.findByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(i18n.language).toBe("en");
    await waitFor(() => expect(seen).toEqual([{ language: "en" }]));
    await waitFor(() => expect(queryClient.getQueryState(["notifications", "unread-count"])?.isInvalidated).toBe(true));
  });
});

describe("UserMenu", () => {
  it("shows who is signed in and leads to the change of password", async () => {
    const user = userEvent.setup();
    renderApp(<UserMenu />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Samia Admin")).toBeInTheDocument();
    expect(within(menu).getByText("sysadmin@impactrisks.com")).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "English" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Changer le mot de passe" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/password");
  });

  it("signs out", async () => {
    const user = userEvent.setup();
    const out = vi.fn();
    server.use(
      http.post("/api/v1/auth/logout", () => {
        out();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<UserMenu />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(await screen.findByTestId("signed-out")).toBeInTheDocument();
    expect(out).toHaveBeenCalledTimes(1);
    expect(wasSignedOut()).toBe(true);
  });

  it("carries the language choice on a phone", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    server.use(patches(seen));
    renderApp(<UserMenu compact withLanguage />, { route: "/admin", me: several });
    await user.click(screen.getByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "English" }));
    await waitFor(() => expect(seen).toEqual([{ language: "en" }]));
    expect(i18n.language).toBe("en");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/shell`
Expected: FAIL with `Failed to resolve import "./LanguageSwitch"`.

- [ ] **Step 4: Write the hooks**

`frontend/src/features/shell/workspaceCounts.ts`:

```ts
import type { WorkspaceId } from "@/app/workspaces";

/**
 * How many things are waiting in each workspace, shown in the switcher (UI 3.2).
 * Nothing is counted yet. Plan 05 replaces this file with one that reads `workspaces/summary`.
 */
export function useWorkspaceCounts(): Partial<Record<WorkspaceId, number>> {
  return {};
}
```

`frontend/src/features/shell/useCurrentWorkspace.ts`:

```ts
import { useLocation } from "react-router";
import { availableWorkspaces, landingWorkspace, workspaceOfPath } from "@/app/navigation";
import type { WorkspaceId } from "@/app/workspaces";
import { useCurrentUser } from "@/features/auth/api";

/** The workspace of the address; on a page that belongs to none (notifications, password), the landing workspace. */
export function useCurrentWorkspace(): WorkspaceId | null {
  const me = useCurrentUser();
  const { pathname } = useLocation();
  const fromPath = workspaceOfPath(pathname);
  if (fromPath && availableWorkspaces(me).includes(fromPath)) return fromPath;
  return landingWorkspace(me);
}
```

`frontend/src/features/shell/useChangeLanguage.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateMe } from "@/features/auth/api";
import { setLanguage, type Lang } from "@/i18n";

/** "Changes at once and is remembered" (UI 3.3). */
export function useChangeLanguage(): (lang: Lang) => void {
  const queryClient = useQueryClient();
  const { mutate } = useUpdateMe();
  return (lang) => {
    void setLanguage(lang);
    mutate(
      { language: lang },
      {
        // Whatever the server wrote in the other language is fetched again, so no screen mixes the two (U9).
        onSuccess: () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" }),
      },
    );
  };
}
```

- [ ] **Step 5: Write the controls**

`frontend/src/features/shell/NavList.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { visibleNav } from "@/app/navigation";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { cn } from "@/lib/utils";

interface NavListProps {
  workspace: WorkspaceId;
  /** A column in the desktop sidebar, or the tab bar at the bottom of a phone. */
  variant: "sidebar" | "tabs";
}

/** The entries of the current workspace only (UI 3.3). */
export function NavList({ workspace, variant }: NavListProps) {
  const { t } = useTranslation();
  const entries = visibleNav(workspace);
  const home = WORKSPACES[workspace].home;

  if (variant === "tabs") {
    return (
      <nav aria-label={t("shell:navigation")} className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-card">
        {entries.map((entry) => (
          <NavLink
            key={entry.path}
            to={entry.path}
            end={entry.path === home}
            className={({ isActive }) =>
              cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-caption font-medium", isActive ? "text-primary" : "text-muted-foreground")
            }
          >
            <entry.icon aria-hidden="true" className="size-5" />
            <span className="max-w-full truncate px-1">{t(entry.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={t("shell:navigation")} className="flex flex-col gap-1">
      {entries.map((entry) => (
        <NavLink
          key={entry.path}
          to={entry.path}
          end={entry.path === home}
          className={({ isActive }) =>
            cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-[120ms] ease-standard",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted",
            )
          }
        >
          <entry.icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{t(entry.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

`frontend/src/features/shell/WorkspaceSwitcher.tsx`:

```tsx
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { availableWorkspaces } from "@/app/navigation";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/features/auth/api";
import { useWorkspaceCounts } from "./workspaceCounts";

const countClass = "tabular rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-info";

/** Appears only for a person with more than one workspace, and says how much waits in each (UI 3.2). */
export function WorkspaceSwitcher({ current }: { current: WorkspaceId | null }) {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const counts = useWorkspaceCounts();
  const available = availableWorkspaces(me);
  if (available.length < 2) return null;

  const currentName = current ? t(WORKSPACES[current].labelKey) : t("shell:workspace.switch");
  const elsewhere = available.filter((id) => id !== current).reduce((sum, id) => sum + (counts[id] ?? 0), 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="w-full justify-between rounded-lg"
          aria-label={elsewhere > 0 ? t("shell:workspace.currentWaiting", { name: currentName, total: elsewhere }) : t("shell:workspace.current", { name: currentName })}
        >
          <span className="truncate">{currentName}</span>
          <span className="flex items-center gap-2">
            {elsewhere > 0 && (
              <span aria-hidden="true" className={countClass}>
                {elsewhere}
              </span>
            )}
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("shell:workspace.switch")}</DropdownMenuLabel>
        {available.map((id) => {
          const name = t(WORKSPACES[id].labelKey);
          const waiting = counts[id] ?? 0;
          return (
            <DropdownMenuItem key={id} aria-label={waiting > 0 ? t("shell:workspace.waiting", { name, total: waiting }) : name} onSelect={() => navigate(WORKSPACES[id].home)}>
              <span className="flex items-center gap-2">
                {name}
                {id === current && <Check aria-hidden="true" className="text-primary" />}
              </span>
              {waiting > 0 && (
                <span aria-hidden="true" className={countClass}>
                  {waiting}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`frontend/src/features/shell/LanguageSwitch.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LANGUAGES, useLang } from "@/i18n";
import { useChangeLanguage } from "./useChangeLanguage";

export function LanguageSwitch() {
  const { t } = useTranslation();
  const lang = useLang();
  const changeLanguage = useChangeLanguage();
  return (
    <div role="group" aria-label={t("language.label")} className="flex gap-1">
      {LANGUAGES.map((code) => (
        <Button
          key={code}
          size="sm"
          lang={code}
          variant={code === lang ? "secondary" : "ghost"}
          aria-pressed={code === lang}
          onClick={() => {
            if (code !== lang) changeLanguage(code);
          }}
        >
          {t(`language.${code}`)}
        </Button>
      ))}
    </div>
  );
}
```

`frontend/src/features/shell/UserMenu.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useLogout } from "@/features/auth/api";
import { LANGUAGES, useLang } from "@/i18n";
import { useChangeLanguage } from "./useChangeLanguage";

interface UserMenuProps {
  /** A round button with initials only, for the phone top bar. */
  compact?: boolean;
  /** Also offer the other language, where there is no room for a separate switch. */
  withLanguage?: boolean;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Name, change password, sign out (UI 3.3). */
export function UserMenu({ compact = false, withLanguage = false }: UserMenuProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const changeLanguage = useChangeLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "icon" : "default"} className={compact ? undefined : "w-full justify-start px-2"} aria-label={t("shell:userMenu.label", { name: me.name })}>
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-info">
            {initialsOf(me.name)}
          </span>
          {!compact && <span className="truncate">{me.name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-body font-semibold text-foreground">{me.name}</span>
          <span className="block">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {withLanguage &&
          LANGUAGES.filter((code) => code !== lang).map((code) => (
            <DropdownMenuItem key={code} lang={code} onSelect={() => changeLanguage(code)}>
              {t(`language.${code}`)}
            </DropdownMenuItem>
          ))}
        <DropdownMenuItem onSelect={() => navigate("/password")}>{t("shell:userMenu.changePassword")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout.mutate()}>{t("shell:userMenu.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/shell src/i18n/parity.test.ts`
Expected: PASS; `controls.test.tsx` has 8 tests, and parity now covers `shell`.

If a menu does not open on `user.click` (the test cannot find a `menuitem`), jsdom is missing pointer events for the installed Radix version: add the `PointerEventStub` shown in Task 4, Step 4 to `src/test/setup.ts`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/shell frontend/src/i18n/locales frontend/src/test/setup.ts
git commit -m "feat(frontend): navigation list, workspace switcher, language switch and user menu"
```

---

### Task 14: The application shell

**Files:**
- Create: `frontend/src/features/shell/AppShell.tsx`, `frontend/src/features/shell/NoWorkspacePage.tsx`
- Modify: `frontend/src/test/handlers.ts`
- Test: `frontend/src/features/shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: the controls of Task 13; `NotificationsBell` (Task 12); `AfterSignInNotice` (Task 11); `EnvironmentStrip` (Task 10); `ProblemBoundary`, `PageLoading`, `useIsPhone` (Tasks 5, 6, 9); `useUpdateMe` (Task 8).
- Produces:
  - `AppShell` (default export): the frame of every signed-in page, as master 9.1. Desktop: a 240px sidebar with the logo, the workspace switcher, the navigation and, at the bottom, notifications, language and the user menu. Phone: a 60px top bar with the workspace name, notifications and the user menu, and a 64px tab bar. It renders the page through `<Outlet />` inside a `ProblemBoundary` and a `Suspense`.
  - It stores the workspace being used as `last_workspace` on the account.
  - `NoWorkspacePage` (default export): what a person without any workspace sees.
  - A default test handler for `PATCH /api/v1/auth/me`.

- [ ] **Step 1: Give tests a default answer for `PATCH auth/me`**

The shell stores the last workspace on its own, so every test that renders it would otherwise need this handler. In `frontend/src/test/handlers.ts` add the import and one entry at the end of the `handlers` array:

```ts
import { makeMe } from "./fixtures";
```

```ts
  http.patch("/api/v1/auth/me", async ({ request }) => HttpResponse.json({ ...makeMe(), ...((await request.json()) as object) })),
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/shell/AppShell.test.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import type { Me } from "@/api/types";
import { meKey } from "@/features/auth/api";
import { markSignedIn } from "@/features/auth/session";
import { makeMe } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { setPhoneViewport } from "@/test/viewport";
import AppShell from "./AppShell";

vi.mock("@/app/homes", () => ({ HOMES: { admin: () => null } }));
vi.mock("@/workspaces/admin/routes", () => ({ adminRoutes: [{ path: "accounts", element: null }] }));
vi.mock("@/workspaces/team/routes", () => ({ teamRoutes: [{ path: "people", element: null }] }));

function Failing(): never {
  throw new ProblemError({ status: 500, code: "core.unexpected", detail: "", requestId: "req-7" });
}

function openShell(address: string, me: Me = makeMe({ last_workspace: "admin" })) {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: "/admin/accounts", element: <p>Page des comptes</p> },
          { path: "/team/people", element: <Link to="/admin/accounts">Vers les comptes</Link> },
          { path: "/notifications", element: <p>Page des notifications</p> },
          { path: "/broken", element: <Failing /> },
        ],
      },
    ],
    { initialEntries: [address] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe("AppShell on a desktop", () => {
  it("frames the page with the logo, the navigation and, at the bottom, notifications, language and the user menu", async () => {
    openShell("/admin/accounts");
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByRole("img", { name: "IRIS HR" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Comptes" })).toHaveAttribute("aria-current", "page");
    expect(await within(sidebar).findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("group", { name: "Langue" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Menu de Samia Admin" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("Page des comptes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#main");
  });

  it("has no workspace switcher for one workspace, and no environment strip outside the test stack", () => {
    openShell("/admin/accounts");
    expect(screen.queryByRole("button", { name: /^Espace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows the switcher to a person with several workspaces, and the strip on the test stack", () => {
    openShell("/admin/accounts", makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "admin", environment: "test" }));
    expect(screen.getByRole("button", { name: "Espace : Administration" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Environnement de test. Ceci n'est pas la production.");
  });

  it("keeps the navigation of the landing workspace on a page that belongs to none", () => {
    openShell("/notifications");
    expect(screen.getByText("Page des notifications")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comptes" })).not.toHaveAttribute("aria-current");
  });

  it("stores the workspace in use, so that the next sign-in lands there", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const me = makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "team" });
    server.use(
      http.patch("/api/v1/auth/me", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        seen.push(body);
        return HttpResponse.json({ ...me, ...body });
      }),
    );
    openShell("/team/people", me);
    expect(seen).toEqual([]);
    await user.click(screen.getByRole("link", { name: "Vers les comptes" }));
    await waitFor(() => expect(seen).toEqual([{ last_workspace: "admin" }]));
  });

  it("shows the sign-in notice once, above the page", () => {
    markSignedIn();
    openShell("/admin/accounts");
    expect(within(screen.getByRole("main")).getByRole("complementary", { name: "À propos de votre connexion" })).toBeInTheDocument();
  });

  it("keeps the frame when a page fails, and shows the reference", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openShell("/broken");
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
    expect(screen.getByText("Référence : req-7")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
  });
});

describe("AppShell on a phone", () => {
  it("has a top bar with the workspace name, notifications and the user menu, and a tab bar", async () => {
    setPhoneViewport(true);
    openShell("/admin/accounts");
    const bar = screen.getByRole("banner");
    expect(within(bar).getByText("Administration")).toBeInTheDocument();
    expect(await within(bar).findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Menu de Samia Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Langue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "IRIS HR" })).not.toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(tabs).getAllByRole("link").map((link) => link.textContent)).toEqual(["État", "Comptes"]);
    expect(within(screen.getByRole("main")).getByText("Page des comptes")).toBeInTheDocument();
  });

  it("puts the switcher in the top bar for a person with several workspaces", () => {
    setPhoneViewport(true);
    openShell("/admin/accounts", makeMe({ roles: ["employee", "manager", "sysadmin"], last_workspace: "admin" }));
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Espace : Administration" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/shell/AppShell.test.tsx`
Expected: FAIL with `Failed to resolve import "./AppShell"`.

- [ ] **Step 4: Write the shell**

`frontend/src/features/shell/NoWorkspacePage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";

/** A signed-in person whose roles open no workspace: nothing to show, and who to ask. */
export default function NoWorkspacePage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-md">
      <PageHeader title={t("shell:noWorkspace.title")} />
      <p className="text-body text-text-secondary">{t("shell:noWorkspace.body")}</p>
    </div>
  );
}
```

`frontend/src/features/shell/AppShell.tsx`:

```tsx
import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router";
import { availableWorkspaces, workspaceOfPath } from "@/app/navigation";
import { WORKSPACES } from "@/app/workspaces";
import logo from "@/assets/iris-logo.png";
import { PageLoading } from "@/components/PageLoading";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { useIsPhone } from "@/components/useIsPhone";
import { AfterSignInNotice } from "@/features/auth/AfterSignInNotice";
import { useCurrentUser, useUpdateMe } from "@/features/auth/api";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";
import { EnvironmentStrip } from "./EnvironmentStrip";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavList } from "./NavList";
import { useCurrentWorkspace } from "./useCurrentWorkspace";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const skipClass =
  "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-body focus:font-semibold focus:text-primary";

/** The frame of every signed-in page: one layout per viewport, never both (master 9.1). */
export default function AppShell() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const phone = useIsPhone();
  const { pathname } = useLocation();
  const workspace = useCurrentWorkspace();
  const { mutate: remember } = useUpdateMe();
  const several = availableWorkspaces(me).length > 1;
  const inUse = workspaceOfPath(pathname);

  useEffect(() => {
    // "After sign-in the user lands on the workspace they used last" (UI 3.2).
    if (inUse !== null && inUse === workspace && me.last_workspace !== inUse) remember({ last_workspace: inUse });
  }, [inUse, workspace, me.last_workspace, remember]);

  const page = (
    <ProblemBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </ProblemBoundary>
  );

  if (phone) {
    return (
      <div className="min-h-dvh bg-background">
        <a href="#main" className={skipClass}>
          {t("skipToContent")}
        </a>
        <EnvironmentStrip environment={me.environment} />
        <header className="sticky top-0 z-30 flex h-15 items-center gap-2 border-b border-border bg-card px-4">
          <div className="min-w-0 flex-1">
            {several ? (
              <WorkspaceSwitcher current={workspace} />
            ) : (
              <p className="truncate text-section font-semibold text-foreground">{workspace ? t(WORKSPACES[workspace].labelKey) : t("appName")}</p>
            )}
          </div>
          <NotificationsBell compact />
          <UserMenu compact withLanguage />
        </header>
        <main id="main" className="px-4 pb-24 pt-4">
          <AfterSignInNotice />
          {page}
        </main>
        {workspace && <NavList workspace={workspace} variant="tabs" />}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className={skipClass}>
        {t("skipToContent")}
      </a>
      <EnvironmentStrip environment={me.environment} />
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4">
          <img src={logo} alt={t("appName")} className="h-8 w-auto self-start" />
          <WorkspaceSwitcher current={workspace} />
          <div className="min-h-0 flex-1 overflow-y-auto">{workspace && <NavList workspace={workspace} variant="sidebar" />}</div>
          <div className="flex flex-col gap-2 border-t border-sidebar-border pt-3">
            <NotificationsBell />
            <LanguageSwitch />
            <UserMenu />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-[clamp(16px,3vw,40px)] py-8">
          <AfterSignInNotice />
          {page}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/shell`
Expected: PASS, 2 files; `AppShell.test.tsx` has 9 tests.

- [ ] **Step 6: Check lint and types, then commit**

Run: `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck`
Expected: both exit with code 0.

```bash
git add frontend/src/features/shell frontend/src/test/handlers.ts
git commit -m "feat(frontend): application shell with a desktop sidebar and a phone tab bar"
```

---

### Task 15: The route tree, the providers and the entry

**Files:**
- Create: `frontend/src/app/providers.tsx`, `frontend/src/app/router.tsx`
- Modify: `frontend/src/main.tsx` (replace)
- Test: `frontend/src/app/router.test.tsx`

**Interfaces:**
- Consumes: the guards (Task 9), `SignInPage` (Task 10), `ChooseNewPasswordPage` (Task 11), `AppShell` and `NoWorkspacePage` (Task 14), `HOMES`, `sharedRoutes`, `WORKSPACE_ROUTES`, `visibleNav`, `landingWorkspace` (Task 8), `setUnauthorizedHandler` and `makeQueryClient` (Task 2), `Toaster` (Task 5).
- Produces:
  - `AppProviders({ children, queryClient? })`: the query client, the toaster, and the rule that any call answering 401 forgets the user, which sends the page to Sign in.
  - `routes: RouteObject[]` and `createAppRouter()` from `@/app/router`. The tree is fixed from here on:

    ```
    /login                         SignInPage
    RequireAuth
      /password/new                ChooseNewPasswordPage
      RequirePasswordChange
        AppShell
          /                        the landing workspace, or NoWorkspacePage
          ...sharedRoutes          /password, /notifications, and what later plans append
          /me /team /hr /overview /admin
            RequireWorkspace
              index                HOMES[id], else a redirect to the first navigation entry
              ...<id>Routes        what plans append
          *                        NotAvailable
    ```
  - No later plan edits `router.tsx`: pages are added through `sharedRoutes`, the five route arrays and `HOMES`.

- [ ] **Step 1: Write the failing test**

`frontend/src/app/router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { makeMe, makePage, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { AppProviders } from "./providers";
import { routes } from "./router";

// Administration has a home and one page that reads the API; the other workspaces are empty.
vi.mock("@/app/homes", () => ({ HOMES: { admin: () => <p>Accueil de l'administration</p> } }));
vi.mock("@/workspaces/admin/routes", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  const { api, call } = await import("@/api/client");
  function AccountsProbe() {
    const query = useQuery({ queryKey: ["accounts", "probe"], queryFn: () => call(api.GET("/api/v1/accounts")), retry: false });
    return <p>{query.isSuccess ? "Liste des comptes" : "Lecture des comptes"}</p>;
  }
  return { adminRoutes: [{ path: "accounts", element: <AccountsProbe /> }] };
});

function openApp(address: string) {
  const queryClient = makeTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [address] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, address: () => router.state.location.pathname + router.state.location.search };
}

const sysadmin = makeMe({ last_workspace: "admin" });
const signedInAs = (me = sysadmin) => http.get("/api/v1/auth/me", () => HttpResponse.json(me));
const nobody = () => http.get("/api/v1/auth/me", () => problemResponse(401, "core.not_authenticated", "Connectez-vous."));
const accountsOk = () => http.get("/api/v1/accounts", () => HttpResponse.json(makePage([])));

describe("the application", () => {
  it("sends an anonymous visitor to Sign in, remembering the page", async () => {
    server.use(nobody());
    const app = openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login?next=%2Fadmin%2Faccounts");
  });

  it("lands a System Administrator on Administration", async () => {
    server.use(signedInAs());
    const app = openApp("/");
    expect(await screen.findByText("Accueil de l'administration")).toBeInTheDocument();
    expect(app.address()).toBe("/admin");
    expect(screen.getByRole("link", { name: "État" })).toHaveAttribute("aria-current", "page");
  });

  it("tells a person without any workspace who to ask", async () => {
    server.use(signedInAs(makeMe({ roles: [] })));
    openApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Rien ici pour l'instant" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("keeps a temporary-password user on 'choose a new password'", async () => {
    server.use(signedInAs(makeMe({ must_change_password: true })));
    const app = openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe" })).toBeInTheDocument();
    expect(app.address()).toBe("/password/new");
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("shows 'not available' inside the shell for an address that does not exist", async () => {
    server.use(signedInAs());
    openApp("/nowhere/at/all");
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comptes" })).toBeInTheDocument();
  });

  it("shows 'not available' for the workspace of another role", async () => {
    server.use(signedInAs());
    openApp("/hr");
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
  });

  it("returns to the page, with its filters, after the session ended", async () => {
    const user = userEvent.setup();
    server.use(
      signedInAs(),
      http.get("/api/v1/accounts", () => problemResponse(401, "core.not_authenticated", "Votre session a expiré.")),
    );
    const app = openApp("/admin/accounts?state=locked");
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login?next=%2Fadmin%2Faccounts%3Fstate%3Dlocked");

    server.use(
      http.post("/api/v1/auth/login", () => HttpResponse.json(sysadmin)),
      accountsOk(),
    );
    await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), "sysadmin@impactrisks.com");
    await user.type(screen.getByLabelText("Mot de passe"), "Correct-Horse-42!");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Liste des comptes")).toBeInTheDocument();
    expect(app.address()).toBe("/admin/accounts?state=locked");
  });

  it("signs out from the menu and asks for no return", async () => {
    const user = userEvent.setup();
    server.use(
      signedInAs(),
      accountsOk(),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    const app = openApp("/admin/accounts");
    await user.click(await screen.findByRole("button", { name: "Menu de Samia Admin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(app.address()).toBe("/login");
  });

  it("says 'being updated' when the application is away", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html>Bad gateway</html>", { status: 502 })));
    openApp("/admin/accounts");
    expect(await screen.findByRole("heading", { level: 1, name: "Mise à jour en cours" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/app/router.test.tsx`
Expected: FAIL with `Failed to resolve import "./providers"`.

- [ ] **Step 3: Write the providers, the route tree and the entry**

`frontend/src/app/providers.tsx`:

```tsx
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@/api/client";
import { makeQueryClient } from "@/api/queryClient";
import { Toaster } from "@/components/toast";
import { meKey } from "@/features/auth/api";

const applicationClient = makeQueryClient();

interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass their own client. */
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient = applicationClient }: AppProvidersProps) {
  useEffect(() => {
    // A 401 on any call means the session is over. Forgetting the user makes RequireAuth
    // send the page to Sign in, with the address to come back to.
    setUnauthorizedHandler(() => queryClient.setQueryData(meKey, null));
    return () => setUnauthorizedHandler(() => {});
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
```

`frontend/src/app/router.tsx`:

```tsx
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { NotAvailable } from "@/components/NotAvailable";
import { useCurrentUser } from "@/features/auth/api";
import ChooseNewPasswordPage from "@/features/auth/ChooseNewPasswordPage";
import SignInPage from "@/features/auth/SignInPage";
import AppShell from "@/features/shell/AppShell";
import NoWorkspacePage from "@/features/shell/NoWorkspacePage";
import { RequireAuth, RequirePasswordChange, RequireWorkspace } from "./guards";
import { HOMES } from "./homes";
import { landingWorkspace, visibleNav, WORKSPACE_ROUTES } from "./navigation";
import { sharedRoutes } from "./sharedRoutes";
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from "./workspaces";

/** The root address: the workspace used last, or the most specific one (UI 3.2). */
function Landing() {
  const me = useCurrentUser();
  const workspace = landingWorkspace(me);
  return workspace ? <Navigate to={WORKSPACES[workspace].home} replace /> : <NoWorkspacePage />;
}

/** The home of a workspace, or its first page while it has no home yet. */
function WorkspaceIndex({ id }: { id: WorkspaceId }) {
  const Home = HOMES[id];
  if (Home) return <Home />;
  const first = visibleNav(id)[0];
  return first ? <Navigate to={first.path} replace /> : <NotAvailable />;
}

export const routes: RouteObject[] = [
  { path: "/login", element: <SignInPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/password/new", element: <ChooseNewPasswordPage /> },
      {
        element: <RequirePasswordChange />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/", element: <Landing /> },
              ...sharedRoutes,
              ...WORKSPACE_IDS.map(
                (id): RouteObject => ({
                  path: `/${id}`,
                  element: <RequireWorkspace id={id} />,
                  children: [{ index: true, element: <WorkspaceIndex id={id} /> }, ...WORKSPACE_ROUTES[id]],
                }),
              ),
              { path: "*", element: <NotAvailable /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
```

Replace `frontend/src/main.tsx` with:

```tsx
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "./styles/index.css";
import "./i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { AppProviders } from "./app/providers";
import { createAppRouter } from "./app/router";

const router = createAppRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/app`
Expected: PASS, 3 files (`navigation`, `guards`, `router`); `router.test.tsx` has 9 tests.

- [ ] **Step 5: See it in the browser**

Run: `docker compose up -d` and `docker compose exec app python manage.py seed_demo`, then open `http://localhost:5173`.
Expected: the Sign in page, in French or English according to the browser. Sign in as `sysadmin@impactrisks.com` (Sonia Admin in the demo data) with `Correct-Horse-42!`. The shell appears with "Rien ici pour l'instant" / "Nothing here yet": Administration has no page until the next task. The user menu signs out.

If the browser shows a 403 on `POST /api/v1/auth/login` with a CSRF message, the request did not carry the cookie or the origin was refused. Check in the browser's network panel that `GET /api/v1/auth/csrf` answered with a `Set-Cookie: csrftoken=…` header and that the login request has an `X-CSRFToken` header; both travel through the Vite proxy on the same origin, so no cross-origin setting is needed in Django.

- [ ] **Step 6: Check lint, types and the build, then commit**

Run: `docker compose run --rm web npm run lint`, `docker compose run --rm web npm run typecheck` and `docker compose run --rm web npm run build`
Expected: all three succeed.

```bash
git add frontend/src/app frontend/src/main.tsx
git commit -m "feat(frontend): route tree, providers and entry; the application signs in end to end"
```

---

### Task 16: Administration: Status

**Files:**
- Create: `frontend/src/components/Block.tsx`
- Create: `frontend/src/features/accounts/api.ts`, `frontend/src/features/accounts/StatusPage.tsx`
- Create: `frontend/src/i18n/locales/fr/accounts.json`, `frontend/src/i18n/locales/en/accounts.json`
- Modify: `frontend/src/app/homes.ts` (replace), `frontend/src/components/index.ts`
- Test: `frontend/src/features/accounts/StatusPage.test.tsx`

**Interfaces:**
- Consumes: `GET admin/status` (master 7.1); `PageHeader`, `StatusBadge`, `DataTable`, `PageLoading` (Tasks 5 and 6); `formatDateTime`, `formatBytes` (Task 3).
- Produces:
  - `Block({ title: string; children: ReactNode; action?: ReactNode })` from `@/components/Block`: one block of a home or of a detail page, a titled section on a bordered surface.
  - `accountKeys` and `useAdminStatus()` from `@/features/accounts/api` (Tasks 17 and 19 add hooks to this file).
  - `StatusPage` (default export, `{ readOnly?: boolean }`), registered as the home of Administration in `HOMES`.
  - The `accounts` namespace, complete for Tasks 16, 17 and 19. Job names are translated under `accounts:status.jobs.names.<job name>`, for every job of master 6.9.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/accounts.json`:

```json
{
  "status": {
    "title": "Status",
    "createAccount": "Create account",
    "health": {
      "title": "Health",
      "ok": "Everything is working.",
      "failing": "Not working: {{parts}}.",
      "parts": {
        "app": "the application",
        "database": "the database",
        "worker": "background jobs"
      },
      "version": "Version {{version}}, {{environment}} environment",
      "environments": {
        "development": "development",
        "test": "test",
        "production": "production"
      }
    },
    "attention": {
      "title": "Accounts needing attention",
      "none": "No account needs attention.",
      "locked": "Locked",
      "awaiting": "Temporary password never used",
      "expired": "Temporary password expired",
      "withoutAccount": "Employees without an account"
    },
    "jobs": {
      "title": "Scheduled work",
      "none": "No scheduled work has run yet.",
      "name": "Work",
      "lastRun": "Last run",
      "result": "Result",
      "nextRun": "Next run",
      "ok": "Done",
      "failed": "Failed",
      "failedWith": "Failed: {{detail}}",
      "never": "Not run yet",
      "names": {
        "core": { "heartbeat": "Worker heartbeat" },
        "accounts": { "cleanup": "Clean-up of sessions and temporary passwords" },
        "organisation": { "delegation_transitions": "Start and end of delegations" },
        "requests": {
          "reminders_and_flags": "Reminders and alerts on waiting steps",
          "certificate_deadlines": "Certificate deadlines"
        },
        "balances": { "month_end_credit": "Month-end leave credit" },
        "ops": { "backup": "Backup" }
      }
    },
    "backup": {
      "title": "Backup",
      "none": "No backup has been made yet.",
      "last": "Last backup: {{when}}.",
      "size": "Size: {{size}}.",
      "storage": "Storage used by backups: {{size}}."
    }
  },
  "states": {
    "active": "Active",
    "awaiting_first_sign_in": "Waiting for the first sign-in",
    "locked": "Locked",
    "disabled": "Disabled"
  },
  "list": {
    "title": "Accounts",
    "create": "Create account",
    "name": "Name",
    "email": "Email",
    "state": "State",
    "roles": "Roles",
    "lastSignIn": "Last sign-in",
    "search": "Name or email",
    "allStates": "All states",
    "allRoles": "All roles",
    "noRole": "No role",
    "empty": "No account matches these filters.",
    "emptyHint": "Change the filters, or create an account."
  },
  "create": {
    "title": "Create account",
    "fullName": "Name",
    "email": "Professional email",
    "roles": "Roles",
    "rolesHint": "Leave empty for an account without a special role.",
    "rolesIncompatible": "HR and System Administrator cannot be combined on one account.",
    "submit": "Create the account",
    "created": "Account created for {{name}}"
  },
  "temporary": {
    "title": "Temporary password",
    "intro": "Hand this password over in person. It is shown only once.",
    "expires": "It expires on {{when}}. The person chooses their own password at the first sign-in.",
    "done": "Done"
  },
  "account": {
    "email": "Email",
    "state": "State",
    "roles": "Roles",
    "lastSignIn": "Last sign-in",
    "reset": "Reset the password",
    "resetTitle": "Reset this password?",
    "resetConsequence": "The current password stops working at once. A temporary password is shown once, for you to hand over in person.",
    "unlock": "Unlock",
    "unlocked": "Account unlocked.",
    "disable": "Disable",
    "disableTitle": "Disable this account?",
    "disableConsequence": "The person is signed out at once and can no longer sign in.",
    "disableConfirm": "Disable the account",
    "disabled": "Account disabled.",
    "enable": "Enable",
    "enabled": "Account enabled.",
    "manageRoles": "Change roles",
    "rolesTitle": "Roles of {{name}}",
    "rolesIntro": "Every change is recorded in the security log.",
    "addRole": "Add: {{role}}",
    "removeRole": "Remove: {{role}}",
    "roleAdded": "Role added.",
    "roleRemoved": "Role removed.",
    "incompatible": "{{role}} cannot be added to an account that holds {{other}}.",
    "details": "Details",
    "assigned": "{{role}}: given by {{by}} on {{when}}",
    "assignedBySystem": "the system",
    "previousSignIn": "Previous sign-in",
    "failedAttempts": "Failed attempts in a row",
    "lockedUntil": "Locked until",
    "created": "Created",
    "createdBy": "{{when}} by {{by}}",
    "events": "Recent security events",
    "noEvents": "No event recorded."
  }
}
```

`frontend/src/i18n/locales/fr/accounts.json`:

```json
{
  "status": {
    "title": "État",
    "createAccount": "Créer un compte",
    "health": {
      "title": "Santé",
      "ok": "Tout fonctionne.",
      "failing": "Ne fonctionne pas : {{parts}}.",
      "parts": {
        "app": "l'application",
        "database": "la base de données",
        "worker": "les tâches de fond"
      },
      "version": "Version {{version}}, environnement de {{environment}}",
      "environments": {
        "development": "développement",
        "test": "test",
        "production": "production"
      }
    },
    "attention": {
      "title": "Comptes à traiter",
      "none": "Aucun compte ne nécessite d'attention.",
      "locked": "Verrouillés",
      "awaiting": "Mot de passe temporaire jamais utilisé",
      "expired": "Mot de passe temporaire expiré",
      "withoutAccount": "Employés sans compte"
    },
    "jobs": {
      "title": "Tâches planifiées",
      "none": "Aucune tâche planifiée n'a encore été exécutée.",
      "name": "Tâche",
      "lastRun": "Dernière exécution",
      "result": "Résultat",
      "nextRun": "Prochaine exécution",
      "ok": "Terminée",
      "failed": "Échec",
      "failedWith": "Échec : {{detail}}",
      "never": "Pas encore exécutée",
      "names": {
        "core": { "heartbeat": "Signal de vie du service de tâches" },
        "accounts": { "cleanup": "Nettoyage des sessions et des mots de passe temporaires" },
        "organisation": { "delegation_transitions": "Début et fin des délégations" },
        "requests": {
          "reminders_and_flags": "Rappels et alertes sur les étapes en attente",
          "certificate_deadlines": "Échéances des certificats"
        },
        "balances": { "month_end_credit": "Crédit de congés de fin de mois" },
        "ops": { "backup": "Sauvegarde" }
      }
    },
    "backup": {
      "title": "Sauvegarde",
      "none": "Aucune sauvegarde n'a encore été faite.",
      "last": "Dernière sauvegarde : {{when}}.",
      "size": "Taille : {{size}}.",
      "storage": "Espace utilisé par les sauvegardes : {{size}}."
    }
  },
  "states": {
    "active": "Actif",
    "awaiting_first_sign_in": "En attente de première connexion",
    "locked": "Verrouillé",
    "disabled": "Désactivé"
  },
  "list": {
    "title": "Comptes",
    "create": "Créer un compte",
    "name": "Nom",
    "email": "Adresse e-mail",
    "state": "État",
    "roles": "Rôles",
    "lastSignIn": "Dernière connexion",
    "search": "Nom ou adresse e-mail",
    "allStates": "Tous les états",
    "allRoles": "Tous les rôles",
    "noRole": "Aucun rôle",
    "empty": "Aucun compte ne correspond à ces filtres.",
    "emptyHint": "Modifiez les filtres, ou créez un compte."
  },
  "create": {
    "title": "Créer un compte",
    "fullName": "Nom",
    "email": "Adresse e-mail professionnelle",
    "roles": "Rôles",
    "rolesHint": "Laissez vide pour un compte sans rôle particulier.",
    "rolesIncompatible": "RH et Administrateur système ne peuvent pas être réunis sur un même compte.",
    "submit": "Créer le compte",
    "created": "Compte créé pour {{name}}"
  },
  "temporary": {
    "title": "Mot de passe temporaire",
    "intro": "Remettez ce mot de passe en main propre. Il n'est affiché qu'une seule fois.",
    "expires": "Il expire le {{when}}. La personne choisit son propre mot de passe à la première connexion.",
    "done": "Terminé"
  },
  "account": {
    "email": "Adresse e-mail",
    "state": "État",
    "roles": "Rôles",
    "lastSignIn": "Dernière connexion",
    "reset": "Réinitialiser le mot de passe",
    "resetTitle": "Réinitialiser ce mot de passe ?",
    "resetConsequence": "Le mot de passe actuel cesse de fonctionner immédiatement. Un mot de passe temporaire est affiché une seule fois, à remettre en main propre.",
    "unlock": "Déverrouiller",
    "unlocked": "Compte déverrouillé.",
    "disable": "Désactiver",
    "disableTitle": "Désactiver ce compte ?",
    "disableConsequence": "La personne est déconnectée immédiatement et ne peut plus se connecter.",
    "disableConfirm": "Désactiver le compte",
    "disabled": "Compte désactivé.",
    "enable": "Activer",
    "enabled": "Compte activé.",
    "manageRoles": "Modifier les rôles",
    "rolesTitle": "Rôles de {{name}}",
    "rolesIntro": "Chaque modification est inscrite au journal de sécurité.",
    "addRole": "Ajouter : {{role}}",
    "removeRole": "Retirer : {{role}}",
    "roleAdded": "Rôle ajouté.",
    "roleRemoved": "Rôle retiré.",
    "incompatible": "{{role}} ne peut pas être ajouté à un compte qui détient {{other}}.",
    "details": "Détails",
    "assigned": "{{role}} : attribué par {{by}} le {{when}}",
    "assignedBySystem": "le système",
    "previousSignIn": "Connexion précédente",
    "failedAttempts": "Échecs de connexion consécutifs",
    "lockedUntil": "Verrouillé jusqu'au",
    "created": "Création",
    "createdBy": "{{when}} par {{by}}",
    "events": "Événements de sécurité récents",
    "noEvents": "Aucun événement enregistré."
  }
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/accounts/StatusPage.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { AdminStatus } from "@/api/types";
import { HOMES } from "@/app/homes";
import { visibleNav } from "@/app/navigation";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import StatusPage from "./StatusPage";

const healthy = {
  health: { status: "ok", app: "ok", database: "ok", worker: "ok", version: "1.2.0", environment: "production" },
  accounts: { locked: [], awaiting_first_sign_in: [], temp_expired: [], employees_without_account: [] },
  jobs: [
    {
      name: "core.heartbeat",
      schedule: "* * * * *",
      last_started_at: "2026-10-05T09:00:00+01:00",
      last_finished_at: "2026-10-05T09:00:01+01:00",
      last_ok: true,
      last_detail: "",
      next_run_at: "2026-10-05T09:01:00+01:00",
    },
  ],
  backup: null,
} as unknown as AdminStatus;

const troubled = {
  health: { status: "degraded", app: "ok", database: "fail", worker: "stale", version: "1.2.0", environment: "test" },
  accounts: {
    locked: [{ public_id: "a1", name: "Sami Ben Ali", email: "sami.benali@impactrisks.com" }],
    awaiting_first_sign_in: [{ public_id: "a2", name: "Leila Trabelsi", email: "leila.trabelsi@impactrisks.com" }],
    temp_expired: [],
    employees_without_account: [{ public_id: "e9", name: "Nour Gharbi", email: "nour.gharbi@impactrisks.com" }],
  },
  jobs: [
    {
      name: "accounts.cleanup",
      schedule: "30 2 * * *",
      last_started_at: "2026-10-05T02:30:00+01:00",
      last_finished_at: "2026-10-05T02:30:02+01:00",
      last_ok: false,
      last_detail: "connexion refusée",
      next_run_at: "2026-10-06T02:30:00+01:00",
    },
    { name: "ops.backup", schedule: "30 23 * * *", last_started_at: null, last_finished_at: null, last_ok: null, last_detail: "", next_run_at: "2026-10-05T23:30:00+01:00" },
  ],
  backup: { last_at: "2026-10-04T23:30:00+01:00", size_bytes: 13_002_342, storage_used_bytes: 3_221_225_472 },
} as unknown as AdminStatus;

const answers = (status: AdminStatus) => http.get("/api/v1/admin/status", () => HttpResponse.json(status));
const plain = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("StatusPage", () => {
  it("is the home of Administration", () => {
    expect(HOMES.admin).toBeDefined();
    expect(visibleNav("admin")[0].path).toBe("/admin");
  });

  it("says in one line that everything works, and offers to create an account", async () => {
    server.use(answers(healthy));
    renderApp(<StatusPage />, { route: "/admin" });
    expect(screen.getByRole("heading", { level: 1, name: "État" })).toBeInTheDocument();
    expect(await screen.findByText("Tout fonctionne.")).toBeInTheDocument();
    expect(screen.getByText("Version 1.2.0, environnement de production")).toBeInTheDocument();
    expect(screen.getByText("Aucun compte ne nécessite d'attention.")).toBeInTheDocument();
    expect(screen.getByText("Aucune sauvegarde n'a encore été faite.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/admin/accounts/new");

    const jobs = screen.getByRole("table", { name: "Tâches planifiées" });
    const row = within(jobs).getAllByRole("row")[1];
    expect(within(row).getByText("Signal de vie du service de tâches")).toBeInTheDocument();
    expect(within(row).getByText("Terminée")).toBeInTheDocument();
    expect(plain(row)).toContain("5 oct. 2026 à 09:00");
    expect(plain(row)).toContain("5 oct. 2026 à 09:01");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });

  it("names what fails, who cannot get in, which work failed and the last backup", async () => {
    server.use(answers(troubled));
    renderApp(<StatusPage />, { route: "/admin" });
    expect(await screen.findByText("Ne fonctionne pas : la base de données, les tâches de fond.")).toBeInTheDocument();

    const attention = screen.getByRole("region", { name: "Comptes à traiter" });
    expect(within(attention).getByText("Verrouillés")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "Sami Ben Ali" })).toHaveAttribute("href", "/admin/accounts/a1");
    expect(within(attention).getByText("Mot de passe temporaire jamais utilisé")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "Leila Trabelsi" })).toHaveAttribute("href", "/admin/accounts/a2");
    expect(within(attention).queryByText("Mot de passe temporaire expiré")).not.toBeInTheDocument();
    expect(within(attention).getByText("Employés sans compte")).toBeInTheDocument();
    expect(within(attention).getByText("Nour Gharbi")).toBeInTheDocument();
    expect(within(attention).queryByRole("link", { name: "Nour Gharbi" })).not.toBeInTheDocument();

    const jobs = screen.getByRole("table", { name: "Tâches planifiées" });
    expect(within(jobs).getByText("Échec : connexion refusée")).toBeInTheDocument();
    expect(within(jobs).getByText("Pas encore exécutée")).toBeInTheDocument();

    const backup = screen.getByRole("region", { name: "Sauvegarde" });
    expect(plain(backup)).toContain("Dernière sauvegarde : 4 oct. 2026 à 23:30.");
    expect(plain(backup)).toContain("Taille : 12,4 Mo.");
    expect(plain(backup)).toContain("Espace utilisé par les sauvegardes : 3 Go.");
  });

  it("offers no action when it is read-only", async () => {
    server.use(answers(troubled));
    renderApp(<StatusPage readOnly />, { route: "/admin" });
    expect(await screen.findByText("Verrouillés")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Sami Ben Ali")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/accounts`
Expected: FAIL with `Failed to resolve import "./StatusPage"`.

- [ ] **Step 4: Write the block, the hook and the page**

`frontend/src/components/Block.tsx`:

```tsx
import { useId, type ReactNode } from "react";

interface BlockProps {
  title: string;
  children: ReactNode;
  /** A secondary action shown beside the title. */
  action?: ReactNode;
}

/** One block of a home or of a detail page: a titled section on a bordered surface. */
export function Block({ title, children, action }: BlockProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-section font-semibold text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
```

Add to `frontend/src/components/index.ts`, in alphabetical order:

```ts
export { Block } from "./Block";
```

`frontend/src/features/accounts/api.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";

export const accountKeys = {
  all: ["accounts"] as const,
  status: ["accounts", "status"] as const,
  list: (query: Record<string, string | number>) => ["accounts", "list", query] as const,
  detail: (id: string) => ["accounts", "detail", id] as const,
};

/** Health, accounts needing attention, scheduled work and backup, refreshed every minute. */
export function useAdminStatus() {
  return useQuery({
    queryKey: accountKeys.status,
    queryFn: () => call(api.GET("/api/v1/admin/status")),
    refetchInterval: 60_000,
  });
}
```

`frontend/src/features/accounts/StatusPage.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { AdminStatus } from "@/api/types";
import { Block } from "@/components/Block";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdminStatus } from "./api";

type Job = AdminStatus["jobs"][number];
type Person = AdminStatus["accounts"]["locked"][number];

const PARTS = ["app", "database", "worker"] as const;

/** The home of Administration: is the system working, and who cannot get in? (UI 9.1) */
export default function StatusPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const status = useAdminStatus();

  const header = (
    <PageHeader
      title={t("accounts:status.title")}
      primary={
        readOnly ? undefined : (
          <Button asChild variant="primary">
            <Link to="/admin/accounts/new">{t("accounts:status.createAccount")}</Link>
          </Button>
        )
      }
    />
  );

  if (status.isPending) {
    return (
      <>
        {header}
        <PageLoading />
      </>
    );
  }
  if (status.error) throw status.error;

  const { health, accounts, jobs, backup } = status.data;
  const failing = PARTS.filter((part) => health[part] !== "ok");

  const jobName = (name: string) => {
    const key = `accounts:status.jobs.names.${name}`;
    return i18n.exists(key) ? t(key) : name;
  };
  const jobResult = (job: Job): ReactNode => {
    if (job.last_ok === true) return <StatusBadge tone="approved">{t("accounts:status.jobs.ok")}</StatusBadge>;
    if (job.last_ok === false) {
      return <StatusBadge tone="refused">{job.last_detail ? t("accounts:status.jobs.failedWith", { detail: job.last_detail }) : t("accounts:status.jobs.failed")}</StatusBadge>;
    }
    return <StatusBadge tone="neutral">{t("accounts:status.jobs.never")}</StatusBadge>;
  };
  const jobColumns: Column<Job>[] = [
    { key: "name", header: t("accounts:status.jobs.name"), cell: (job) => jobName(job.name) },
    { key: "last", header: t("accounts:status.jobs.lastRun"), cell: (job) => (job.last_finished_at ? formatDateTime(job.last_finished_at, lang) : t("state.never")) },
    { key: "result", header: t("accounts:status.jobs.result"), cell: jobResult },
    { key: "next", header: t("accounts:status.jobs.nextRun"), cell: (job) => (job.next_run_at ? formatDateTime(job.next_run_at, lang) : t("state.none")) },
  ];

  const groups: { label: string; people: Person[]; linked: boolean }[] = [
    { label: t("accounts:status.attention.locked"), people: accounts.locked, linked: true },
    { label: t("accounts:status.attention.awaiting"), people: accounts.awaiting_first_sign_in, linked: true },
    { label: t("accounts:status.attention.expired"), people: accounts.temp_expired, linked: true },
    // These are employees, not accounts: there is nothing to open yet.
    { label: t("accounts:status.attention.withoutAccount"), people: accounts.employees_without_account, linked: false },
  ].filter((group) => group.people.length > 0);

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title={t("accounts:status.health.title")}>
          {failing.length === 0 ? (
            <StatusBadge tone="approved">{t("accounts:status.health.ok")}</StatusBadge>
          ) : (
            <StatusBadge tone="refused">
              {t("accounts:status.health.failing", { parts: failing.map((part) => t(`accounts:status.health.parts.${part}`)).join(", ") })}
            </StatusBadge>
          )}
          <p className="mt-3 text-body text-muted-foreground">
            {t("accounts:status.health.version", { version: health.version, environment: t(`accounts:status.health.environments.${health.environment}`) })}
          </p>
        </Block>

        <Block title={t("accounts:status.attention.title")}>
          {groups.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("accounts:status.attention.none")}</p>
          ) : (
            <dl className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <dt className="text-caption font-medium text-muted-foreground">{group.label}</dt>
                  <dd className="m-0 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body text-foreground">
                    {group.people.map((person) =>
                      group.linked && !readOnly ? (
                        <Link key={person.public_id} to={`/admin/accounts/${person.public_id}`} className="font-semibold text-primary hover:underline">
                          {person.name}
                        </Link>
                      ) : (
                        <span key={person.public_id}>{person.name}</span>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Block>

        <div className="lg:col-span-2">
          <Block title={t("accounts:status.jobs.title")}>
            <DataTable
              label={t("accounts:status.jobs.title")}
              columns={jobColumns}
              rows={jobs}
              rowKey={(job) => job.name}
              empty={<p className="text-body text-muted-foreground">{t("accounts:status.jobs.none")}</p>}
            />
          </Block>
        </div>

        <div className="lg:col-span-2">
          <Block title={t("accounts:status.backup.title")}>
            {backup ? (
              <div className="flex flex-col gap-1 text-body text-foreground">
                <p>{t("accounts:status.backup.last", { when: formatDateTime(backup.last_at, lang) })}</p>
                {backup.size_bytes !== null && <p>{t("accounts:status.backup.size", { size: formatBytes(backup.size_bytes, lang) })}</p>}
                {backup.storage_used_bytes !== null && (
                  <p className="text-muted-foreground">{t("accounts:status.backup.storage", { size: formatBytes(backup.storage_used_bytes, lang) })}</p>
                )}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">{t("accounts:status.backup.none")}</p>
            )}
          </Block>
        </div>
      </div>
    </>
  );
}
```

Replace `frontend/src/app/homes.ts` with:

```ts
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { WorkspaceId } from "./workspaces";

// One line per workspace; a plan adds a line or replaces the value of a line.
export const HOMES: Partial<Record<WorkspaceId, LazyExoticComponent<ComponentType>>> = {
  admin: lazy(() => import("@/features/accounts/StatusPage")),
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/accounts src/i18n/parity.test.ts`
Expected: PASS; `StatusPage.test.tsx` has 4 tests, and parity now covers `accounts`.

- [ ] **Step 6: See it in the browser, then commit**

Open `http://localhost:5173` and sign in as `sysadmin@impactrisks.com`.
Expected: the Status page with its four blocks; "État" / "Status" is the only navigation entry; the heartbeat job shows a run from the last minute.

```bash
git add frontend/src/components frontend/src/features/accounts frontend/src/app/homes.ts frontend/src/i18n/locales
git commit -m "feat(frontend): Administration status page: health, accounts, scheduled work, backup"
```

---

### Task 17: Administration: Accounts and Create account

**Files:**
- Modify: `frontend/src/features/accounts/api.ts`, `frontend/src/workspaces/admin/routes.tsx` (replace)
- Create: `frontend/src/features/accounts/AccountState.tsx`, `frontend/src/features/accounts/AccountsPage.tsx`
- Create: `frontend/src/features/accounts/createAccountForm.ts`, `frontend/src/features/accounts/SubjectFields.tsx`, `frontend/src/features/accounts/RolesField.tsx`, `frontend/src/features/accounts/TemporaryPassword.tsx`, `frontend/src/features/accounts/CreateAccountPage.tsx`
- Test: `frontend/src/features/accounts/AccountsPage.test.tsx`, `frontend/src/features/accounts/CreateAccountPage.test.tsx`

**Interfaces:**
- Consumes: `GET accounts` (filters `search`, `state`, `role`) and `POST accounts` with the codes `accounts.email_taken`, `accounts.employee_has_account`, `accounts.employee_unknown`, `accounts.roles_incompatible`, `auth.domain_not_allowed` (master 7.2); the list components (Task 6); the form components (Task 7); the `accounts` texts (Task 16).
- Produces:
  - `useAccounts(query)`, `useCreateAccount()` in `@/features/accounts/api`.
  - `AccountState({ state })`: the account state as a sentence with its tone.
  - `AccountsPage` (default export, `{ readOnly?: boolean }`) at `accounts`, and `CreateAccountPage` (default export) at `accounts/new`, both registered in `adminRoutes`. Links between them are relative, so the pages also work when plan 06 mounts them elsewhere.
  - `@/features/accounts/createAccountForm`: `ASSIGNABLE_ROLES`, `AssignableRole`, `CreateAccountValues = { employee: string | null; full_name: string; email: string; roles: AssignableRole[] }`, `EMPTY_ACCOUNT`, `createAccountSchema(t)`, `toAccountBody(values)`.
  - **Extension point** `@/features/accounts/SubjectFields`: `SubjectFields({ control }: { control: Control<CreateAccountValues> })`. It draws the inputs, and shows the errors, of the form fields `employee`, `full_name` and `email`. Here it asks for a name and an email. Plan 02 replaces the whole file with one that also offers the employees without an account (it sets `employee` to the employee's `public_id`, after which name and email are not required).
  - `TemporaryPassword({ title, password, expiresAt, onDone })`: the one-time display, also used by Task 19.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/accounts/AccountsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Account } from "@/api/types";
import { makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AccountsPage from "./AccountsPage";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    public_id: "a1",
    email: "sami.benali@impactrisks.com",
    name: "Sami Ben Ali",
    state: "active",
    roles: ["hr"],
    last_login_at: "2026-10-05T09:00:00+01:00",
    has_employee: true,
    ...overrides,
  } as Account;
}

const accounts = [
  makeAccount(),
  makeAccount({ public_id: "a2", name: "Leila Trabelsi", email: "leila.trabelsi@impactrisks.com", state: "awaiting_first_sign_in", roles: [], last_login_at: null }),
  makeAccount({ public_id: "a3", name: "Nour Gharbi", email: "nour.gharbi@impactrisks.com", state: "locked", roles: ["exec", "manager"] }),
  makeAccount({ public_id: "a4", name: "Samia Admin", email: "sysadmin@impactrisks.com", state: "disabled", roles: ["sysadmin"] }),
];

/** Answers the list and records the query of every call. */
function listing(seen: URLSearchParams[], items: Account[] = accounts, count?: number) {
  return http.get("/api/v1/accounts", ({ request }) => {
    seen.push(new URL(request.url).searchParams);
    return HttpResponse.json(makePage(items, count));
  });
}

describe("AccountsPage", () => {
  it("shows each account with its state as a sentence, its roles and its last sign-in", async () => {
    const seen: URLSearchParams[] = [];
    server.use(listing(seen));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(screen.getByRole("heading", { level: 1, name: "Comptes" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Comptes" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Nom", "Adresse e-mail", "État", "Rôles", "Dernière connexion"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Actif")).toBeInTheDocument();
    expect(within(rows[0]).getByText("RH")).toBeInTheDocument();
    expect((rows[0].textContent ?? "").replace(/\s/g, " ")).toContain("5 oct. 2026 à 09:00");
    expect(within(rows[1]).getByText("En attente de première connexion")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Aucun rôle")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Jamais")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Verrouillé")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Direction générale, Responsable")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Désactivé")).toBeInTheDocument();
    expect(seen[0].get("page_size")).toBe("25");
    expect(seen[0].get("page")).toBe("1");
  });

  it("opens an account and offers to create one", async () => {
    const user = userEvent.setup();
    server.use(listing([]));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/admin/accounts/new");
    await user.click(await screen.findByRole("button", { name: "Nour Gharbi" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts/a3");
  });

  it("sends the three filters to the API and keeps them in the address", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(listing(seen));
    const { router } = renderApp(<AccountsPage />, { route: "/admin/accounts" });
    await screen.findByRole("table", { name: "Comptes" });
    await user.type(screen.getByRole("searchbox", { name: "Nom ou adresse e-mail" }), "nour");
    await user.selectOptions(screen.getByRole("combobox", { name: "État" }), "locked");
    await user.selectOptions(screen.getByRole("combobox", { name: "Rôles" }), "exec");
    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.get("search")).toBe("nour");
      expect(last?.get("state")).toBe("locked");
      expect(last?.get("role")).toBe("exec");
    });
    expect(router.state.location.search).toBe("?search=nour&state=locked&role=exec");
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("explains an empty result and offers the action that fills it", async () => {
    server.use(listing([], []));
    renderApp(<AccountsPage />, { route: "/admin/accounts?state=locked" });
    expect(await screen.findByText("Aucun compte ne correspond à ces filtres.")).toBeInTheDocument();
    expect(screen.getByText("Modifiez les filtres, ou créez un compte.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Créer un compte" })).toHaveLength(2);
  });

  it("pages through a long list", async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    server.use(listing(seen, accounts, 60));
    renderApp(<AccountsPage />, { route: "/admin/accounts" });
    expect(await screen.findByText("Page 1 sur 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    await waitFor(() => expect(seen.at(-1)?.get("page")).toBe("2"));
  });

  it("offers no creation when it is read-only", async () => {
    server.use(listing([]));
    renderApp(<AccountsPage readOnly />, { route: "/admin/accounts" });
    await screen.findByRole("table", { name: "Comptes" });
    expect(screen.queryByRole("link", { name: "Créer un compte" })).not.toBeInTheDocument();
  });
});
```

`frontend/src/features/accounts/CreateAccountPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import CreateAccountPage from "./CreateAccountPage";

const PASSWORD = "Xk7-temp-Pass-2209";

const created = {
  account: { public_id: "a9", email: "karim.admin@impactrisks.com", name: "Karim Admin", state: "awaiting_first_sign_in", roles: ["sysadmin"], last_login_at: null, has_employee: false },
  temporary_password: PASSWORD,
  expires_at: "2026-10-06T10:00:00+01:00",
};

const open = () => renderApp(<CreateAccountPage />, { route: "/admin/accounts/new" });

async function fill(user: UserEvent, name = "Karim Admin", email = "karim.admin@impactrisks.com") {
  await user.type(screen.getByLabelText("Nom"), name);
  await user.type(screen.getByLabelText("Adresse e-mail professionnelle"), email);
}

describe("CreateAccountPage", () => {
  it("shows the temporary password once and keeps it out of storage", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/accounts", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { router } = open();
    expect(screen.getByRole("heading", { level: 1, name: "Créer un compte" })).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "Administrateur système" }));
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Compte créé pour Karim Admin" })).toBeInTheDocument();
    expect(body).toEqual({ full_name: "Karim Admin", email: "karim.admin@impactrisks.com", roles: ["sysadmin"] });
    expect(screen.getByText(PASSWORD)).toBeInTheDocument();
    expect(screen.getByText("Remettez ce mot de passe en main propre. Il n'est affiché qu'une seule fois.")).toBeInTheDocument();
    expect((document.body.textContent ?? "").replace(/\s/g, " ")).toContain("Il expire le 6 oct. 2026 à 10:00.");
    expect(screen.queryByRole("button", { name: "Créer le compte" })).not.toBeInTheDocument();

    const kept = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + router.state.location.pathname + router.state.location.search;
    expect(kept).not.toContain(PASSWORD);

    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/admin/accounts");
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
  });

  it.each([
    ["auth.domain_not_allowed", "email", "Seules les adresses @impactrisks.com sont acceptées."],
    ["accounts.email_taken", "email", "Cette adresse est déjà utilisée par un compte."],
    ["accounts.roles_incompatible", "roles", "RH et Administrateur système ne peuvent pas être réunis sur un même compte."],
    ["accounts.employee_has_account", "employee", "Cette personne a déjà un compte."],
  ])("shows the refusal %s where it belongs and keeps what was typed", async (code, field, detail) => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/accounts", () => problemResponse(400, code, detail, [{ field }])));
    open();
    await fill(user, "Karim Admin", "karim@gmail.com");
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Karim Admin");
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveValue("karim@gmail.com");
    if (field === "email") {
      expect(screen.getByLabelText("Adresse e-mail professionnelle")).toHaveAccessibleDescription(detail);
    }
  });

  it("refuses HR together with System Administrator before calling the API", async () => {
    const user = userEvent.setup();
    const called = vi.fn();
    server.use(
      http.post("/api/v1/accounts", () => {
        called();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    open();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "RH" }));
    await user.click(screen.getByRole("checkbox", { name: "Administrateur système" }));
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect(await screen.findByText("RH et Administrateur système ne peuvent pas être réunis sur un même compte.")).toBeInTheDocument();
    expect(called).not.toHaveBeenCalled();
  });

  it("asks for a name and an email", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Créer le compte" }));
    await waitFor(() => expect(screen.getAllByText("Ce champ est obligatoire.")).toHaveLength(2));
  });

  it("leads back to the list", () => {
    open();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/accounts`
Expected: FAIL with `Failed to resolve import "./AccountsPage"` and `"./CreateAccountPage"`.

- [ ] **Step 3: Add the hooks**

Replace `frontend/src/features/accounts/api.ts` with:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { AccountCreate, AccountQuery } from "@/api/types";

export const accountKeys = {
  all: ["accounts"] as const,
  status: ["accounts", "status"] as const,
  list: (query: Record<string, string | number>) => ["accounts", "list", query] as const,
  detail: (id: string) => ["accounts", "detail", id] as const,
};

/** Health, accounts needing attention, scheduled work and backup, refreshed every minute. */
export function useAdminStatus() {
  return useQuery({
    queryKey: accountKeys.status,
    queryFn: () => call(api.GET("/api/v1/admin/status")),
    refetchInterval: 60_000,
  });
}

/** A page of accounts. `query` comes from the address as plain strings; the API validates it. */
export function useAccounts(query: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: accountKeys.list(query),
    queryFn: () => call(api.GET("/api/v1/accounts", { params: { query: query as unknown as AccountQuery } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AccountCreate) => call(api.POST("/api/v1/accounts", { body })),
    // The answer carries the temporary password: it must not outlive the page that shows it.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}
```

- [ ] **Step 4: Write the list**

`frontend/src/features/accounts/AccountState.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";

const TONES: Record<string, StatusTone> = {
  active: "approved",
  awaiting_first_sign_in: "waiting",
  locked: "refused",
  disabled: "neutral",
};

/** The state of an account as a sentence, never as a code. */
export function AccountState({ state }: { state: string }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TONES[state] ?? "neutral"}>{t(`accounts:states.${state}`)}</StatusBadge>;
}
```

`frontend/src/features/accounts/AccountsPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { Account } from "@/api/types";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { FilterSelect, FilterText } from "@/components/filters";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { AccountState } from "./AccountState";
import { useAccounts } from "./api";
import { ASSIGNABLE_ROLES } from "./createAccountForm";

const PAGE_SIZE = 25;
const STATES = ["active", "awaiting_first_sign_in", "locked", "disabled"] as const;

/** Who has access, and in what state (UI 9.2). */
export default function AccountsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const list = useListParams({ search: "", state: "", role: "" });
  const accounts = useAccounts({ ...list.query, page_size: PAGE_SIZE });

  if (accounts.error) throw accounts.error;

  const create = readOnly ? undefined : (
    <Button asChild variant="primary">
      <Link to="new">{t("accounts:list.create")}</Link>
    </Button>
  );

  const columns: Column<Account>[] = [
    { key: "name", header: t("accounts:list.name"), cell: (account) => account.name },
    { key: "email", header: t("accounts:list.email"), cell: (account) => account.email },
    { key: "state", header: t("accounts:list.state"), cell: (account) => <AccountState state={account.state} /> },
    {
      key: "roles",
      header: t("accounts:list.roles"),
      cell: (account) => (account.roles.length > 0 ? account.roles.map((role) => t(`roles.${role}`)).join(", ") : t("accounts:list.noRole")),
    },
    {
      key: "last",
      header: t("accounts:list.lastSignIn"),
      cell: (account) => (account.last_login_at ? formatDateTime(account.last_login_at, lang) : t("state.never")),
    },
  ];

  return (
    <>
      <PageHeader title={t("accounts:list.title")} primary={create} />
      <FilterBar>
        <FilterText label={t("accounts:list.search")} value={list.filters.search} onChange={(value) => list.setFilter("search", value)} />
        <FilterSelect
          label={t("accounts:list.state")}
          value={list.filters.state}
          onChange={(value) => list.setFilter("state", value)}
          options={[{ value: "", label: t("accounts:list.allStates") }, ...STATES.map((state) => ({ value: state, label: t(`accounts:states.${state}`) }))]}
        />
        <FilterSelect
          label={t("accounts:list.roles")}
          value={list.filters.role}
          onChange={(value) => list.setFilter("role", value)}
          options={[{ value: "", label: t("accounts:list.allRoles") }, ...ASSIGNABLE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))]}
        />
      </FilterBar>
      <DataTable
        label={t("accounts:list.title")}
        columns={columns}
        rows={accounts.data?.results ?? []}
        rowKey={(account) => account.public_id}
        onRowOpen={(account) => navigate(account.public_id)}
        isLoading={accounts.isPending}
        empty={
          <EmptyState
            title={t("accounts:list.empty")}
            hint={readOnly ? undefined : t("accounts:list.emptyHint")}
            action={
              readOnly ? undefined : (
                <Button asChild>
                  <Link to="new">{t("accounts:list.create")}</Link>
                </Button>
              )
            }
          />
        }
      />
      <Pager page={list.page} pageSize={PAGE_SIZE} total={accounts.data?.count ?? 0} onPage={list.setPage} />
    </>
  );
}
```

- [ ] **Step 5: Write the creation form**

`frontend/src/features/accounts/createAccountForm.ts`:

```ts
import type { TFunction } from "i18next";
import { z } from "zod";
import type { AccountCreate } from "@/api/types";

/** The roles a System Administrator gives. Employee and Manager come from the organisation chart. */
export const ASSIGNABLE_ROLES = ["hr", "exec", "sysadmin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface CreateAccountValues {
  /** The `public_id` of the employee the account is for, or null for an account by name and email. */
  employee: string | null;
  full_name: string;
  email: string;
  roles: AssignableRole[];
}

export const EMPTY_ACCOUNT: CreateAccountValues = { employee: null, full_name: "", email: "", roles: [] };

export function createAccountSchema(t: TFunction) {
  return z
    .object({
      employee: z.string().nullable(),
      full_name: z.string().trim(),
      email: z.string().trim(),
      roles: z.array(z.enum(ASSIGNABLE_ROLES)),
    })
    .superRefine((values, context) => {
      if (!values.employee) {
        if (!values.full_name) context.addIssue({ code: "custom", path: ["full_name"], message: t("form.required") });
        if (!values.email) context.addIssue({ code: "custom", path: ["email"], message: t("form.required") });
      }
      if (values.roles.includes("hr") && values.roles.includes("sysadmin")) {
        context.addIssue({ code: "custom", path: ["roles"], message: t("accounts:create.rolesIncompatible") });
      }
    });
}

/** For an employee the API takes the name and the email from the record; otherwise they are sent. */
export function toAccountBody(values: CreateAccountValues): AccountCreate {
  const body = values.employee ? { employee: values.employee, roles: values.roles } : { full_name: values.full_name, email: values.email, roles: values.roles };
  return body as AccountCreate;
}
```

`frontend/src/features/accounts/SubjectFields.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useFormState, type Control } from "react-hook-form";
import { TextField } from "@/components/TextField";
import type { CreateAccountValues } from "./createAccountForm";

/**
 * Who the account is for. It draws the inputs, and shows the errors, of `employee`, `full_name` and `email`.
 * In step 1 there are no employee records yet, so it asks for a name and an email.
 * Plan 02 replaces this whole file with one that also offers the employees without an account.
 */
export function SubjectFields({ control }: { control: Control<CreateAccountValues> }) {
  const { t } = useTranslation();
  const { errors } = useFormState({ control, name: "employee" });
  return (
    <>
      <TextField control={control} name="full_name" label={t("accounts:create.fullName")} autoComplete="off" />
      <TextField control={control} name="email" label={t("accounts:create.email")} type="email" inputMode="email" autoComplete="off" />
      {errors.employee?.message && (
        <p role="alert" className="text-caption font-medium text-refused">
          {errors.employee.message}
        </p>
      )}
    </>
  );
}
```

`frontend/src/features/accounts/RolesField.tsx`:

```tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useController, type Control } from "react-hook-form";
import { ASSIGNABLE_ROLES, type AssignableRole, type CreateAccountValues } from "./createAccountForm";

/** The three roles a System Administrator gives, as checkboxes. */
export function RolesField({ control }: { control: Control<CreateAccountValues> }) {
  const { t } = useTranslation();
  const id = useId();
  const { field, fieldState } = useController({ control, name: "roles" });
  const selected = field.value;
  const error = fieldState.error?.message;

  const toggle = (role: AssignableRole, checked: boolean) => {
    field.onChange(checked ? [...selected, role] : selected.filter((entry) => entry !== role));
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}>
      <legend className="mb-1 p-0 text-body font-medium text-foreground">{t("accounts:create.roles")}</legend>
      {ASSIGNABLE_ROLES.map((role) => (
        <label key={role} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-foreground md:min-h-8">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.includes(role)} onChange={(event) => toggle(role, event.target.checked)} />
          {t(`roles.${role}`)}
        </label>
      ))}
      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        {t("accounts:create.rolesHint")}
      </p>
      {error && (
        <p id={`${id}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </fieldset>
  );
}
```

`frontend/src/features/accounts/TemporaryPassword.tsx`:

```tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

interface TemporaryPasswordProps {
  title: string;
  password: string;
  expiresAt: string;
  onDone: () => void;
}

/**
 * The temporary password, shown once (ACC-05). It lives in the state of the page that renders this
 * and nowhere else: not in storage, not in the address, not in a cache.
 */
export function TemporaryPassword({ title, password, expiresAt, onDone }: TemporaryPasswordProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex max-w-md flex-col gap-3">
      <h2 id={id} className="text-section font-semibold text-foreground">
        {title}
      </h2>
      <p className="tabular select-all rounded-md border border-border bg-muted px-4 py-3 text-dialog font-semibold tracking-wide text-foreground">{password}</p>
      <p className="text-body text-foreground">{t("accounts:temporary.intro")}</p>
      <p className="text-body text-text-secondary">{t("accounts:temporary.expires", { when: formatDateTime(expiresAt, lang) })}</p>
      <div className="mt-2">
        <Button variant="primary" onClick={onDone}>
          {t("accounts:temporary.done")}
        </Button>
      </div>
    </section>
  );
}
```

`frontend/src/features/accounts/CreateAccountPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useResolvedPath } from "react-router";
import type { AccountCreated } from "@/api/types";
import { FormSummary } from "@/components/FormSummary";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { backToList } from "@/components/useListParams";
import { useProblemForm } from "@/components/useProblemForm";
import { useCreateAccount } from "./api";
import { createAccountSchema, EMPTY_ACCOUNT, toAccountBody, type CreateAccountValues } from "./createAccountForm";
import { RolesField } from "./RolesField";
import { SubjectFields } from "./SubjectFields";
import { TemporaryPassword } from "./TemporaryPassword";

/** Create an account and hand over its temporary password (UI 9.3). */
export default function CreateAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listPath = useResolvedPath("..", { relative: "path" }).pathname;
  const create = useCreateAccount();
  // The only place the temporary password is kept. Leaving the page drops it.
  const [created, setCreated] = useState<AccountCreated | null>(null);

  const schema = useMemo(() => createAccountSchema(t), [t]);
  const form = useForm<CreateAccountValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_ACCOUNT });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;
  const back = backToList(listPath);

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      setCreated(await create.mutateAsync(toAccountBody(values)));
    } catch (error) {
      problems.onError(error);
    }
  });

  if (created) {
    return (
      <>
        <PageHeader title={t("accounts:create.title")} />
        <TemporaryPassword
          title={t("accounts:create.created", { name: created.account.name })}
          password={created.temporary_password}
          expiresAt={created.expires_at}
          onDone={() => navigate(back)}
        />
      </>
    );
  }

  return (
    <div className="max-w-md">
      <PageHeader title={t("accounts:create.title")} back={back} />
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        <SubjectFields control={form.control} />
        <RolesField control={form.control} />
        <div>
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t("accounts:create.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Register the two pages**

Replace `frontend/src/workspaces/admin/routes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const CreateAccountPage = lazy(() => import("@/features/accounts/CreateAccountPage"));

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [
  { path: "accounts", element: <AccountsPage /> },
  { path: "accounts/new", element: <CreateAccountPage /> },
];
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/accounts`
Expected: PASS; `AccountsPage.test.tsx` has 6 tests and `CreateAccountPage.test.tsx` has 8.

If TypeScript rejects `account.roles.map(...)` or `created.account.name`, the serializers of plan 01a are looser than master 7.2 (`roles` must be a list of strings, `account` a nested `AccountOut`): tighten them there and regenerate the types.

- [ ] **Step 8: See it in the browser, then commit**

Sign in as `sysadmin@impactrisks.com`. "Comptes" / "Accounts" now appears in the navigation. Create an account for `karim.admin@impactrisks.com` with the System Administrator role.
Expected: the temporary password is displayed with its expiry; after "Terminé" / "Done" the list shows the account as waiting for its first sign-in; pressing Back does not show the password again.

```bash
git add frontend/src/features/accounts frontend/src/workspaces/admin/routes.tsx
git commit -m "feat(frontend): accounts list and account creation with a one-time temporary password"
```

---

### Task 18: Administration: Security log

**Files:**
- Create: `frontend/src/features/audit/api.ts`, `frontend/src/features/audit/labels.ts`, `frontend/src/features/audit/EventSheet.tsx`, `frontend/src/features/audit/AuditLogPage.tsx`
- Create: `frontend/src/i18n/locales/fr/audit.json`, `frontend/src/i18n/locales/en/audit.json`
- Modify: `frontend/src/workspaces/admin/routes.tsx` (replace)
- Test: `frontend/src/features/audit/AuditLogPage.test.tsx`

**Interfaces:**
- Consumes: `GET audit/security`, `GET audit/business` and their `/export` (master 7.3; filters `actor`, `action`, `object_type`, `object_id`, `from`, `to`); the audit actions of plan 01a (its contract note 19); `useAccounts` (Task 17); the list components (Task 6); `TaskSheet` (Task 7).
- Produces:
  - `useAuditEvents(category, query)`, `auditExportUrl(category, filters)`, `AuditCategory` from `@/features/audit/api`.
  - `actionLabel(action, t, i18n): string` and `SECURITY_ACTIONS` from `@/features/audit/labels`. An action without a text under `audit:actions.<action>` is shown by its code; the plan that adds an audited action adds its text.
  - `AuditLogPage` (default export) with props `{ category: "security" | "business"; actors?: Option[]; actionOptions?: Option[]; itemTypeOptions?: Option[] }` where `Option = { value: string; label: string }`. Only `category` is needed. Without `actors`, the "who" filter lists the accounts when the reader may list them (System Administrator, Executive Management) and is absent otherwise; plan 06 passes employees for HR. `actionOptions` defaults to the security actions for the security log and to none for the activity log. `itemTypeOptions` sits behind "More filters".
  - `EventSheet({ event, onClose })`: one event with its values before and after; a redacted value reads "changed".
  - The page registered at `security-log` in `adminRoutes`; the `audit` namespace.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/audit.json`:

```json
{
  "security": {
    "title": "Security log",
    "empty": "No security event matches these filters."
  },
  "business": {
    "title": "Activity log",
    "empty": "No activity matches these filters."
  },
  "columns": {
    "when": "When",
    "who": "Who",
    "what": "What happened",
    "on": "On what",
    "address": "Network address"
  },
  "filters": {
    "period": "Period",
    "actor": "Who",
    "anyActor": "Anyone",
    "action": "Kind of event",
    "anyAction": "Any kind",
    "itemType": "Kind of item",
    "anyItemType": "Any kind"
  },
  "system": "The system",
  "event": {
    "title": "Event",
    "reference": "Reference",
    "changes": "What changed",
    "field": "Field",
    "before": "Before",
    "after": "After",
    "changed": "changed",
    "empty": "empty",
    "noChanges": "No value was recorded with this event."
  },
  "actions": {
    "auth": {
      "login": "Signed in",
      "login_failed": "Failed sign-in",
      "locked": "Account locked after failed sign-ins",
      "logout": "Signed out",
      "session_expired": "Session ended after inactivity",
      "password_changed": "Password changed",
      "password_reset": "Password reset by an administrator"
    },
    "account": {
      "created": "Account created",
      "disabled": "Account disabled",
      "enabled": "Account enabled",
      "unlocked": "Account unlocked"
    },
    "role": {
      "assigned": "Role given",
      "removed": "Role removed"
    },
    "setting": {
      "changed": "Parameter changed"
    },
    "audit": {
      "exported": "Log exported"
    }
  }
}
```

`frontend/src/i18n/locales/fr/audit.json`:

```json
{
  "security": {
    "title": "Journal de sécurité",
    "empty": "Aucun événement de sécurité ne correspond à ces filtres."
  },
  "business": {
    "title": "Journal d'activité",
    "empty": "Aucune activité ne correspond à ces filtres."
  },
  "columns": {
    "when": "Quand",
    "who": "Qui",
    "what": "Ce qui s'est passé",
    "on": "Sur quoi",
    "address": "Adresse réseau"
  },
  "filters": {
    "period": "Période",
    "actor": "Qui",
    "anyActor": "Tout le monde",
    "action": "Type d'événement",
    "anyAction": "Tous les types",
    "itemType": "Type d'élément",
    "anyItemType": "Tous les types"
  },
  "system": "Le système",
  "event": {
    "title": "Événement",
    "reference": "Référence",
    "changes": "Ce qui a changé",
    "field": "Champ",
    "before": "Avant",
    "after": "Après",
    "changed": "modifié",
    "empty": "vide",
    "noChanges": "Aucune valeur n'a été enregistrée avec cet événement."
  },
  "actions": {
    "auth": {
      "login": "Connexion",
      "login_failed": "Échec de connexion",
      "locked": "Compte verrouillé après des échecs de connexion",
      "logout": "Déconnexion",
      "session_expired": "Session terminée après inactivité",
      "password_changed": "Mot de passe modifié",
      "password_reset": "Mot de passe réinitialisé par un administrateur"
    },
    "account": {
      "created": "Compte créé",
      "disabled": "Compte désactivé",
      "enabled": "Compte activé",
      "unlocked": "Compte déverrouillé"
    },
    "role": {
      "assigned": "Rôle attribué",
      "removed": "Rôle retiré"
    },
    "setting": {
      "changed": "Paramètre modifié"
    },
    "audit": {
      "exported": "Journal exporté"
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/audit/AuditLogPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/api/types";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AuditLogPage from "./AuditLogPage";
import { actionLabel, SECURITY_ACTIONS } from "./labels";
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
    expect(within(table).getByText("employee.archived")).toBeInTheDocument();
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/audit`
Expected: FAIL with `Failed to resolve import "./AuditLogPage"`.

- [ ] **Step 4: Write the hooks and the labels**

`frontend/src/features/audit/api.ts`:

```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { AuditQuery } from "@/api/types";

export type AuditCategory = "security" | "business";

export const auditKeys = {
  all: ["audit"] as const,
  list: (category: AuditCategory, query: Record<string, string | number>) => ["audit", category, query] as const,
};

/** A page of the security log or of the activity log. `query` comes from the address; the API validates it. */
export function useAuditEvents(category: AuditCategory, query: Record<string, string | number>) {
  return useQuery({
    queryKey: auditKeys.list(category, query),
    queryFn: () => {
      const options = { params: { query: query as unknown as AuditQuery } };
      return category === "security" ? call(api.GET("/api/v1/audit/security", options)) : call(api.GET("/api/v1/audit/business", options));
    },
    placeholderData: keepPreviousData,
  });
}

/** The address of the Excel export of the filtered list. The API records each export. */
export function auditExportUrl(category: AuditCategory, filters: Record<string, string>): string {
  const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString();
  return `/api/v1/audit/${category}/export${search ? `?${search}` : ""}`;
}
```

`frontend/src/features/audit/labels.ts`:

```ts
import type { i18n as I18n, TFunction } from "i18next";

/** The security actions the API records (plan 01a). Each has a text under audit:actions. */
export const SECURITY_ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.locked",
  "auth.logout",
  "auth.session_expired",
  "auth.password_changed",
  "auth.password_reset",
  "account.created",
  "account.disabled",
  "account.enabled",
  "account.unlocked",
  "role.assigned",
  "role.removed",
  "setting.changed",
  "audit.exported",
] as const;

/** What happened, in words. An action that has no text yet is shown by its code rather than hidden. */
export function actionLabel(action: string, t: TFunction, i18n: I18n): string {
  const key = `audit:actions.${action}`;
  return i18n.exists(key) ? t(key) : action;
}
```

- [ ] **Step 5: Write the event sheet and the page**

`frontend/src/features/audit/EventSheet.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { AuditEvent } from "@/api/types";
import { TaskSheet } from "@/components/TaskSheet";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { actionLabel } from "./labels";

interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface EventSheetProps {
  event: AuditEvent | null;
  onClose: () => void;
}

/** One event: who, when, on what, the reference to quote, and the values before and after. */
export function EventSheet({ event, onClose }: EventSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = useLang();

  const text = (value: unknown): string => {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return t("audit:event.empty");
    if (typeof value === "boolean") return value ? t("state.yes") : t("state.no");
    if (Array.isArray(value)) return value.map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const rows: ChangeRow[] = event && isRecord(event.changes)
    ? Object.entries(event.changes).map(([field, value]) => {
        // A redacted field (a sick-leave comment) records that it changed, never its content.
        if (isRecord(value) && value.changed === true) return { field, before: "", after: t("audit:event.changed") };
        if (isRecord(value) && ("before" in value || "after" in value)) return { field, before: text(value.before), after: text(value.after) };
        return { field, before: "", after: text(value) };
      })
    : [];

  const facts: [string, string][] = event
    ? [
        [t("audit:columns.when"), formatDateTime(event.at, lang)],
        [t("audit:columns.who"), event.actor ?? t("audit:system")],
        [t("audit:columns.on"), event.object_label || t("state.none")],
        [t("audit:columns.address"), event.ip_address ?? t("state.none")],
        [t("audit:event.reference"), event.request_id || t("state.none")],
      ]
    : [];

  return (
    <TaskSheet
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={event ? actionLabel(event.action, t, i18n) : t("audit:event.title")}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 break-words text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mb-2 mt-6 text-section font-semibold text-foreground">{t("audit:event.changes")}</h3>
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("audit:event.noChanges")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table aria-label={t("audit:event.changes")} className="w-full border-collapse text-body">
            <thead>
              <tr className="h-10 bg-muted text-caption font-medium text-muted-foreground">
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.field")}
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.before")}
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  {t("audit:event.after")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} className="border-t border-divider">
                  <th scope="row" className="tabular px-3 py-2 text-left font-medium text-text-secondary">
                    {row.field}
                  </th>
                  <td className="break-words px-3 py-2 text-foreground">{row.before}</td>
                  <td className="break-words px-3 py-2 text-foreground">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TaskSheet>
  );
}
```

`frontend/src/features/audit/AuditLogPage.tsx`:

```tsx
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEvent } from "@/api/types";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { FilterDateRange, FilterSelect } from "@/components/filters";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/Pager";
import { buttonVariants } from "@/components/ui/button";
import { useListParams } from "@/components/useListParams";
import { useAccounts } from "@/features/accounts/api";
import { useCurrentUser } from "@/features/auth/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { auditExportUrl, useAuditEvents, type AuditCategory } from "./api";
import { EventSheet } from "./EventSheet";
import { actionLabel, SECURITY_ACTIONS } from "./labels";

const PAGE_SIZE = 25;

export interface Option {
  value: string;
  label: string;
}

interface AuditLogPageProps {
  category: AuditCategory;
  /** People for the "who" filter. By default the accounts, when the reader may list them. */
  actors?: Option[];
  /** Kinds of event to filter on. By default the security actions, for the security log. */
  actionOptions?: Option[];
  /** Kinds of item to filter on, behind "More filters". */
  itemTypeOptions?: Option[];
}

/** The security log (UI 9.6) and the activity log (UI 7.11): the same page over two categories. */
export default function AuditLogPage({ category, actors, actionOptions, itemTypeOptions }: AuditLogPageProps) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const list = useListParams({ from: "", to: "", actor: "", action: "", object_type: "", object_id: "" });
  const [opened, setOpened] = useState<AuditEvent | null>(null);

  const mayListAccounts = (me.roles as readonly string[]).some((role) => role === "sysadmin" || role === "exec");
  const accounts = useAccounts({ page: 1, page_size: 100 }, actors === undefined && mayListAccounts);
  const people = actors ?? (accounts.data?.results ?? []).map((account) => ({ value: account.public_id, label: account.name }));
  const kinds = actionOptions ?? (category === "security" ? SECURITY_ACTIONS.map((action) => ({ value: action, label: actionLabel(action, t, i18n) })) : []);

  // A period typed backwards is read the right way round rather than refused.
  const { from, to } = list.filters;
  const filters = { ...list.filters, ...(from && to && from > to ? { from: to, to: from } : {}) };
  const query: Record<string, string | number> = { page: list.page, page_size: PAGE_SIZE };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  const events = useAuditEvents(category, query);

  if (events.error) throw events.error;

  const title = t(`audit:${category}.title`);
  const columns: Column<AuditEvent>[] = [
    { key: "at", header: t("audit:columns.when"), cell: (event) => formatDateTime(event.at, lang) },
    { key: "actor", header: t("audit:columns.who"), cell: (event) => event.actor ?? t("audit:system") },
    { key: "action", header: t("audit:columns.what"), cell: (event) => actionLabel(event.action, t, i18n) },
    { key: "object", header: t("audit:columns.on"), cell: (event) => event.object_label },
    { key: "address", header: t("audit:columns.address"), cell: (event) => event.ip_address ?? "" },
  ];

  return (
    <>
      <PageHeader
        title={title}
        primary={
          <a href={auditExportUrl(category, filters)} download className={buttonVariants({ variant: "primary" })}>
            <Download aria-hidden="true" />
            {t("actions.export")}
          </a>
        }
      />
      <FilterBar
        more={
          itemTypeOptions && itemTypeOptions.length > 0 ? (
            <FilterSelect
              label={t("audit:filters.itemType")}
              value={list.filters.object_type}
              onChange={(value) => list.setFilter("object_type", value)}
              options={[{ value: "", label: t("audit:filters.anyItemType") }, ...itemTypeOptions]}
            />
          ) : undefined
        }
      >
        <FilterDateRange
          label={t("audit:filters.period")}
          from={list.filters.from}
          to={list.filters.to}
          onFrom={(value) => list.setFilter("from", value)}
          onTo={(value) => list.setFilter("to", value)}
        />
        {people.length > 0 && (
          <FilterSelect
            label={t("audit:filters.actor")}
            value={list.filters.actor}
            onChange={(value) => list.setFilter("actor", value)}
            options={[{ value: "", label: t("audit:filters.anyActor") }, ...people]}
          />
        )}
        {kinds.length > 0 && (
          <FilterSelect
            label={t("audit:filters.action")}
            value={list.filters.action}
            onChange={(value) => list.setFilter("action", value)}
            options={[{ value: "", label: t("audit:filters.anyAction") }, ...kinds]}
          />
        )}
      </FilterBar>
      <DataTable
        label={title}
        columns={columns}
        rows={events.data?.results ?? []}
        rowKey={(event) => String(event.id)}
        onRowOpen={setOpened}
        isLoading={events.isPending}
        empty={<EmptyState title={t(`audit:${category}.empty`)} />}
      />
      <Pager page={list.page} pageSize={PAGE_SIZE} total={events.data?.count ?? 0} onPage={list.setPage} />
      <EventSheet event={opened} onClose={() => setOpened(null)} />
    </>
  );
}
```

- [ ] **Step 6: Register the page**

Replace `frontend/src/workspaces/admin/routes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const CreateAccountPage = lazy(() => import("@/features/accounts/CreateAccountPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [
  { path: "accounts", element: <AccountsPage /> },
  { path: "accounts/new", element: <CreateAccountPage /> },
  { path: "security-log", element: <AuditLogPage category="security" /> },
];
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/audit src/i18n/parity.test.ts`
Expected: PASS; `AuditLogPage.test.tsx` has 8 tests, and parity now covers `audit`. If typing into the two date inputs leaves them empty, set them with `fireEvent.change(input, { target: { value: "2026-10-01" } })` as in Task 7; the component does not change.

Then confirm that the texts cover what the backend really records. From the repository root:

```
docker compose run --rm app python -c "import re,pathlib;print(sorted({m for p in pathlib.Path('apps').rglob('*.py') if '/tests/' not in p.as_posix() for m in re.findall(r'action=\"([a-z_]+\.[a-z_]+)\"', p.read_text(encoding='utf-8'))}))"
```

Expected: the fifteen codes of `SECURITY_ACTIONS`, in alphabetical order. For any code printed that is not in the list, add it to `SECURITY_ACTIONS` and add its text to both `audit.json` files.

- [ ] **Step 8: See it in the browser, then commit**

Sign in as `sysadmin@impactrisks.com`, open "Journal de sécurité" / "Security log".
Expected: your own sign-in is the first row; opening it shows the network address and the reference; "Exporter vers Excel" downloads a workbook and a "Journal exporté" / "Log exported" row appears after a refresh.

```bash
git add frontend/src/features/audit frontend/src/i18n/locales frontend/src/workspaces/admin/routes.tsx
git commit -m "feat(frontend): security log with filters, event detail and Excel export"
```

---

### Task 19: Administration: Account

**Files:**
- Modify: `frontend/src/features/accounts/api.ts` (replace), `frontend/src/workspaces/admin/routes.tsx` (replace)
- Create: `frontend/src/features/accounts/RolesSheet.tsx`, `frontend/src/features/accounts/AccountPage.tsx`
- Test: `frontend/src/features/accounts/AccountPage.test.tsx`

**Interfaces:**
- Consumes: `GET accounts/{public_id}`, `POST …/reset-password`, `POST …/roles`, `DELETE …/roles/{role}`, `POST …/disable`, `/enable`, `/unlock` (master 7.2); the rule of plan 01a that an administrator cannot reset, disable or change the roles of their own account, and that the last active administrator cannot lose the role or be disabled (`accounts.cannot_change_self`, `accounts.last_sysadmin`); `TemporaryPassword`, `AccountState`, `ASSIGNABLE_ROLES` (Task 17); `actionLabel` (Task 18); `ConfirmDialog`, `TaskSheet`, `Disclosure`, `toast` (Tasks 5 and 7).
- Produces:
  - `useAccount(id)`, `useResetPassword(id)`, `useAccountAction(id)` (variable `"disable" | "enable" | "unlock"`), `useAddRole(id)`, `useRemoveRole(id)` in `@/features/accounts/api`. Each state or role action puts the returned account in the cache, so the page shows the new state at once.
  - `AccountPage` (default export, `{ readOnly?: boolean }`) at `accounts/:id`, registered in `adminRoutes`.
  - `RolesSheet({ account, open, onOpenChange })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/accounts/AccountPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDetail } from "@/api/types";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import AccountPage from "./AccountPage";

const PASSWORD = "Rk4-temp-Pass-7781";

function makeDetail(overrides: Partial<AccountDetail> = {}): AccountDetail {
  return {
    public_id: "a1",
    email: "sami.benali@impactrisks.com",
    name: "Sami Ben Ali",
    state: "active",
    roles: ["employee", "hr"],
    last_login_at: "2026-10-05T09:00:00+01:00",
    has_employee: true,
    role_assignments: [{ role: "hr", assigned_by: "Sonia Admin", assigned_at: "2026-09-01T10:00:00+01:00" }],
    previous_login_at: "2026-10-03T08:00:00+01:00",
    failed_attempts: 2,
    locked_until: null,
    created_at: "2026-09-01T09:30:00+01:00",
    created_by: null,
    recent_events: [
      {
        id: 9,
        at: "2026-10-05T09:00:00+01:00",
        actor: "Sami Ben Ali",
        category: "security",
        action: "auth.login",
        object_type: "user",
        object_id: "a1",
        object_label: "sami.benali@impactrisks.com",
        changes: {},
        ip_address: "10.0.0.7",
        request_id: "r9",
      },
    ],
    ...overrides,
  } as AccountDetail;
}

/** The account the API holds; actions replace it, as the real API would. */
let current: AccountDetail;

beforeEach(() => {
  current = makeDetail();
  server.use(http.get("/api/v1/accounts/a1", () => HttpResponse.json(current)));
});

const open = (props: { readOnly?: boolean } = {}, me = makeMe()) => renderApp(<AccountPage {...props} />, { route: "/admin/accounts/a1", me });
const plain = (element: HTMLElement) => (element.textContent ?? "").replace(/\s/g, " ");

describe("AccountPage", () => {
  it("opens on a summary and keeps the details one step away", async () => {
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Sami Ben Ali" })).toBeInTheDocument();
    expect(screen.getByText("sami.benali@impactrisks.com")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Employé, RH")).toBeInTheDocument();
    expect(plain(document.body)).toContain("5 oct. 2026 à 09:00");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/admin/accounts");
    expect(screen.queryByText("Échecs de connexion consécutifs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Détails" }));
    expect(plain(document.body)).toContain("RH : attribué par Sonia Admin le 1 sept. 2026 à 10:00");
    expect(screen.getByText("Échecs de connexion consécutifs")).toBeInTheDocument();
    expect(plain(document.body)).toContain("3 oct. 2026 à 08:00");
    const events = screen.getByRole("list", { name: "Événements de sécurité récents" });
    expect(within(events).getByText("Connexion")).toBeInTheDocument();
    expect(within(events).getByText("10.0.0.7")).toBeInTheDocument();
  });

  it("resets the password after a confirmation and shows the temporary one once", async () => {
    const user = userEvent.setup();
    const asked = vi.fn();
    server.use(
      http.post("/api/v1/accounts/a1/reset-password", () => {
        asked();
        return HttpResponse.json({ temporary_password: PASSWORD, expires_at: "2026-10-06T10:00:00+01:00" });
      }),
    );
    const { router } = open();
    await user.click(await screen.findByRole("button", { name: "Réinitialiser le mot de passe" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Réinitialiser ce mot de passe ?" });
    expect(confirm).toHaveAccessibleDescription(
      "Le mot de passe actuel cesse de fonctionner immédiatement. Un mot de passe temporaire est affiché une seule fois, à remettre en main propre.",
    );
    expect(asked).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Réinitialiser le mot de passe" }));

    const sheet = await screen.findByRole("dialog", { name: "Mot de passe temporaire" });
    expect(within(sheet).getByText(PASSWORD)).toBeInTheDocument();
    expect(plain(sheet)).toContain("Il expire le 6 oct. 2026 à 10:00.");
    const kept = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + router.state.location.pathname + router.state.location.search;
    expect(kept).not.toContain(PASSWORD);

    await user.click(within(sheet).getByRole("button", { name: "Terminé" }));
    await waitFor(() => expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument());
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("offers to unlock only a locked account", async () => {
    const user = userEvent.setup();
    current = makeDetail({ state: "locked", locked_until: "2026-10-05T09:30:00+01:00" });
    server.use(
      http.post("/api/v1/accounts/a1/unlock", () => {
        current = makeDetail({ state: "active" });
        return HttpResponse.json(current);
      }),
    );
    open();
    expect(await screen.findByText("Verrouillé")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    expect(await screen.findByText("Actif")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Compte déverrouillé.");
    expect(screen.queryByRole("button", { name: "Déverrouiller" })).not.toBeInTheDocument();
  });

  it("disables after stating the consequence, then offers to enable", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/accounts/a1/disable", () => {
        current = makeDetail({ state: "disabled" });
        return HttpResponse.json(current);
      }),
      http.post("/api/v1/accounts/a1/enable", () => {
        current = makeDetail({ state: "active" });
        return HttpResponse.json(current);
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: "Désactiver" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Désactiver ce compte ?" });
    expect(confirm).toHaveAccessibleDescription("La personne est déconnectée immédiatement et ne peut plus se connecter.");
    await user.click(within(confirm).getByRole("button", { name: "Désactiver le compte" }));
    expect(await screen.findByText("Désactivé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Désactiver" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activer" }));
    expect(await screen.findByText("Actif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Désactiver" })).toBeInTheDocument();
  });

  it("shows the server's refusal and leaves the account as it is", async () => {
    const user = userEvent.setup();
    current = makeDetail({ roles: ["sysadmin"] });
    server.use(http.post("/api/v1/accounts/a1/disable", () => problemResponse(409, "accounts.last_sysadmin", "Le dernier administrateur actif ne peut pas être désactivé.")));
    open();
    await user.click(await screen.findByRole("button", { name: "Désactiver" }));
    await user.click(await screen.findByRole("button", { name: "Désactiver le compte" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Le dernier administrateur actif ne peut pas être désactivé."));
    expect(screen.getByText("Actif")).toBeInTheDocument();
  });

  it("adds and removes roles, and explains the one it does not offer", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.post("/api/v1/accounts/a1/roles", async ({ request }) => {
        const body = (await request.json()) as { role: string };
        calls.push(`add ${body.role}`);
        current = makeDetail({ roles: ["employee", "exec", "hr"] });
        return HttpResponse.json(current);
      }),
      http.delete("/api/v1/accounts/a1/roles/:role", ({ params }) => {
        calls.push(`remove ${String(params.role)}`);
        current = makeDetail({ roles: ["employee", "exec"] });
        return HttpResponse.json(current);
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: "Modifier les rôles" }));
    const sheet = await screen.findByRole("dialog", { name: "Rôles de Sami Ben Ali" });
    expect(within(sheet).getByText("Administrateur système ne peut pas être ajouté à un compte qui détient RH.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Ajouter : Administrateur système" })).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Ajouter : Direction générale" }));
    expect(await within(sheet).findByRole("button", { name: "Retirer : Direction générale" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Retirer : RH" }));
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Ajouter : RH" })).toBeInTheDocument());
    expect(calls).toEqual(["add exec", "remove hr"]);
    expect(within(sheet).getByRole("button", { name: "Ajouter : Administrateur système" })).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Terminé" }));
    expect(await screen.findByText("Employé, Direction générale")).toBeInTheDocument();
  });

  it("offers no action on the administrator's own account", async () => {
    current = makeDetail({ public_id: "a1", roles: ["sysadmin"] });
    open({}, makeMe({ public_id: "a1" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sami Ben Ali" })).toBeInTheDocument();
    for (const name of ["Réinitialiser le mot de passe", "Désactiver", "Modifier les rôles"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("offers no action when it is read-only", async () => {
    current = makeDetail({ state: "locked" });
    open({ readOnly: true });
    expect(await screen.findByText("Verrouillé")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Détails"]);
  });

  it("shows 'not available' for an account that does not exist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("/api/v1/accounts/a1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    renderApp(
      <ProblemBoundary>
        <AccountPage />
      </ProblemBoundary>,
      { route: "/admin/accounts/a1" },
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Non disponible" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm web npx vitest run src/features/accounts/AccountPage.test.tsx`
Expected: FAIL with `Failed to resolve import "./AccountPage"`.

- [ ] **Step 3: Add the hooks**

Replace `frontend/src/features/accounts/api.ts` with:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { AccountCreate, AccountDetail, AccountQuery } from "@/api/types";
import type { AssignableRole } from "./createAccountForm";

export const accountKeys = {
  all: ["accounts"] as const,
  status: ["accounts", "status"] as const,
  list: (query: Record<string, string | number>) => ["accounts", "list", query] as const,
  detail: (id: string) => ["accounts", "detail", id] as const,
};

/** Health, accounts needing attention, scheduled work and backup, refreshed every minute. */
export function useAdminStatus() {
  return useQuery({
    queryKey: accountKeys.status,
    queryFn: () => call(api.GET("/api/v1/admin/status")),
    refetchInterval: 60_000,
  });
}

/** A page of accounts. `query` comes from the address as plain strings; the API validates it. */
export function useAccounts(query: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: accountKeys.list(query),
    queryFn: () => call(api.GET("/api/v1/accounts", { params: { query: query as unknown as AccountQuery } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AccountCreate) => call(api.POST("/api/v1/accounts", { body })),
    // The answer carries the temporary password: it must not outlive the page that shows it.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: () => call(api.GET("/api/v1/accounts/{public_id}", { params: { path: { public_id: id } } })),
  });
}

export function useResetPassword(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST("/api/v1/accounts/{public_id}/reset-password", { params: { path: { public_id: id } } })),
    // As for creation: the temporary password stays in the page's state only.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

/** A change that answers with the account: the page shows the new state at once, the lists are read again. */
function useAccountChange<V>(id: string, change: (variables: V) => Promise<AccountDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: (account) => {
      queryClient.setQueryData(accountKeys.detail(id), account);
      void queryClient.invalidateQueries({ queryKey: accountKeys.all, predicate: (query) => query.queryKey[1] !== "detail" });
    },
  });
}

export function useAccountAction(id: string) {
  const options = { params: { path: { public_id: id } } };
  return useAccountChange(id, (action: "disable" | "enable" | "unlock") => {
    if (action === "disable") return call(api.POST("/api/v1/accounts/{public_id}/disable", options));
    if (action === "enable") return call(api.POST("/api/v1/accounts/{public_id}/enable", options));
    return call(api.POST("/api/v1/accounts/{public_id}/unlock", options));
  });
}

export function useAddRole(id: string) {
  return useAccountChange(id, (role: AssignableRole) => call(api.POST("/api/v1/accounts/{public_id}/roles", { params: { path: { public_id: id } }, body: { role } })));
}

export function useRemoveRole(id: string) {
  return useAccountChange(id, (role: AssignableRole) => call(api.DELETE("/api/v1/accounts/{public_id}/roles/{role}", { params: { path: { public_id: id, role } } })));
}
```

- [ ] **Step 4: Write the roles sheet and the page**

`frontend/src/features/accounts/RolesSheet.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { problemText } from "@/api/problemText";
import type { AccountDetail } from "@/api/types";
import { TaskSheet } from "@/components/TaskSheet";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAddRole, useRemoveRole } from "./api";
import { ASSIGNABLE_ROLES, type AssignableRole } from "./createAccountForm";

/** One account cannot hold both (PRD 3). */
const EXCLUDES: Partial<Record<AssignableRole, AssignableRole>> = { hr: "sysadmin", sysadmin: "hr" };

interface RolesSheetProps {
  account: AccountDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Add or remove the roles a System Administrator gives. A role that cannot be added is explained, not greyed out. */
export function RolesSheet({ account, open, onOpenChange }: RolesSheetProps) {
  const { t } = useTranslation();
  const add = useAddRole(account.public_id);
  const remove = useRemoveRole(account.public_id);
  const held = account.roles as readonly string[];
  const refused = (error: unknown) => toast(problemText(error, t));

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts:account.rolesTitle", { name: account.name })}
      description={t("accounts:account.rolesIntro")}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {t("actions.done")}
        </Button>
      }
    >
      <ul className="flex flex-col">
        {ASSIGNABLE_ROLES.map((role) => {
          const name = t(`roles.${role}`);
          const other = EXCLUDES[role];
          const has = held.includes(role);
          const excluded = !has && other !== undefined && held.includes(other);
          return (
            <li key={role} className="flex min-h-15 items-center justify-between gap-4 border-b border-divider py-2">
              <div>
                <p className="text-body font-medium text-foreground">{name}</p>
                {excluded && other && <p className="text-caption text-muted-foreground">{t("accounts:account.incompatible", { role: name, other: t(`roles.${other}`) })}</p>}
              </div>
              {has && (
                <Button
                  size="sm"
                  aria-label={t("accounts:account.removeRole", { role: name })}
                  onClick={() => remove.mutate(role, { onSuccess: () => toast(t("accounts:account.roleRemoved")), onError: refused })}
                >
                  {t("actions.remove")}
                </Button>
              )}
              {!has && !excluded && (
                <Button
                  size="sm"
                  aria-label={t("accounts:account.addRole", { role: name })}
                  onClick={() => add.mutate(role, { onSuccess: () => toast(t("accounts:account.roleAdded")), onError: refused })}
                >
                  {t("actions.add")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </TaskSheet>
  );
}
```

`frontend/src/features/accounts/AccountPage.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useResolvedPath } from "react-router";
import { problemText } from "@/api/problemText";
import type { TemporaryPassword as TemporaryPasswordAnswer } from "@/api/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Disclosure } from "@/components/Disclosure";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { TaskSheet } from "@/components/TaskSheet";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { backToList } from "@/components/useListParams";
import { actionLabel } from "@/features/audit/labels";
import { useCurrentUser } from "@/features/auth/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { AccountState } from "./AccountState";
import { useAccount, useAccountAction, useResetPassword } from "./api";
import { RolesSheet } from "./RolesSheet";
import { TemporaryPassword } from "./TemporaryPassword";

const termClass = "text-muted-foreground";
const valueClass = "m-0 text-foreground";

/** One account: its state first, the history one step away, and the actions that apply to it now (UI 9.4). */
export default function AccountPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const { id = "" } = useParams();
  const me = useCurrentUser();
  const listPath = useResolvedPath("..", { relative: "path" }).pathname;
  const account = useAccount(id);
  const reset = useResetPassword(id);
  const act = useAccountAction(id);
  // The only place the temporary password is kept. Closing the sheet drops it.
  const [temporary, setTemporary] = useState<TemporaryPasswordAnswer | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);

  if (account.isPending) return <PageLoading />;
  if (account.error) throw account.error;

  const data = account.data;
  // The API refuses an administrator who acts on their own account, so the actions are not shown there.
  const canAct = !readOnly && data.public_id !== me.public_id;
  const refused = (error: unknown) => toast(problemText(error, t));
  const when = (value: string | null) => (value ? formatDateTime(value, lang) : t("state.never"));

  return (
    <>
      <PageHeader
        title={data.name}
        back={backToList(listPath)}
        primary={
          canAct ? (
            <ConfirmDialog
              trigger={<Button variant="primary">{t("accounts:account.reset")}</Button>}
              title={t("accounts:account.resetTitle")}
              consequence={t("accounts:account.resetConsequence")}
              confirmLabel={t("accounts:account.reset")}
              onConfirm={() => reset.mutate(undefined, { onSuccess: setTemporary, onError: refused })}
            />
          ) : undefined
        }
      >
        {data.email}
      </PageHeader>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 text-body">
        <dt className={termClass}>{t("accounts:account.state")}</dt>
        <dd className={valueClass}>
          <AccountState state={data.state} />
        </dd>
        <dt className={termClass}>{t("accounts:account.roles")}</dt>
        <dd className={valueClass}>{data.roles.length > 0 ? data.roles.map((role) => t(`roles.${role}`)).join(", ") : t("accounts:list.noRole")}</dd>
        <dt className={termClass}>{t("accounts:account.lastSignIn")}</dt>
        <dd className={valueClass}>{when(data.last_login_at)}</dd>
      </dl>

      {canAct && (
        <div className="mt-6 flex flex-wrap gap-3">
          {data.state === "locked" && (
            <Button onClick={() => act.mutate("unlock", { onSuccess: () => toast(t("accounts:account.unlocked")), onError: refused })}>{t("accounts:account.unlock")}</Button>
          )}
          {data.state === "disabled" ? (
            <Button onClick={() => act.mutate("enable", { onSuccess: () => toast(t("accounts:account.enabled")), onError: refused })}>{t("accounts:account.enable")}</Button>
          ) : (
            <ConfirmDialog
              destructive
              trigger={<Button>{t("accounts:account.disable")}</Button>}
              title={t("accounts:account.disableTitle")}
              consequence={t("accounts:account.disableConsequence")}
              confirmLabel={t("accounts:account.disableConfirm")}
              onConfirm={() => act.mutate("disable", { onSuccess: () => toast(t("accounts:account.disabled")), onError: refused })}
            />
          )}
          <Button onClick={() => setRolesOpen(true)}>{t("accounts:account.manageRoles")}</Button>
        </div>
      )}

      <div className="mt-8 max-w-xl">
        <Disclosure title={t("accounts:account.details")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-body">
            <dt className={termClass}>{t("accounts:account.previousSignIn")}</dt>
            <dd className={valueClass}>{when(data.previous_login_at)}</dd>
            <dt className={termClass}>{t("accounts:account.failedAttempts")}</dt>
            <dd className={`${valueClass} tabular`}>{data.failed_attempts}</dd>
            {data.locked_until && (
              <>
                <dt className={termClass}>{t("accounts:account.lockedUntil")}</dt>
                <dd className={valueClass}>{formatDateTime(data.locked_until, lang)}</dd>
              </>
            )}
            <dt className={termClass}>{t("accounts:account.created")}</dt>
            <dd className={valueClass}>
              {t("accounts:account.createdBy", { when: formatDateTime(data.created_at, lang), by: data.created_by ?? t("accounts:account.assignedBySystem") })}
            </dd>
          </dl>
          {data.role_assignments.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-body text-foreground">
              {data.role_assignments.map((assignment) => (
                <li key={assignment.role}>
                  {t("accounts:account.assigned", {
                    role: t(`roles.${assignment.role}`),
                    by: assignment.assigned_by ?? t("accounts:account.assignedBySystem"),
                    when: formatDateTime(assignment.assigned_at, lang),
                  })}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-6 text-section font-semibold text-foreground">{t("accounts:account.events")}</h3>
          {data.recent_events.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("accounts:account.noEvents")}</p>
          ) : (
            <ul aria-label={t("accounts:account.events")} className="flex flex-col text-body">
              {data.recent_events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-divider py-2">
                  <span className="text-foreground">{actionLabel(event.action, t, i18n)}</span>
                  <span className="text-caption text-muted-foreground">{formatDateTime(event.at, lang)}</span>
                  <span className="tabular w-full text-caption text-muted-foreground">{event.ip_address ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </div>

      <TaskSheet
        open={temporary !== null}
        onOpenChange={(open) => {
          if (!open) setTemporary(null);
        }}
        title={t("accounts:temporary.title")}
      >
        {temporary && <TemporaryPassword title={data.name} password={temporary.temporary_password} expiresAt={temporary.expires_at} onDone={() => setTemporary(null)} />}
      </TaskSheet>
      <RolesSheet account={data} open={rolesOpen} onOpenChange={setRolesOpen} />
    </>
  );
}
```

- [ ] **Step 5: Register the page**

Replace `frontend/src/workspaces/admin/routes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const CreateAccountPage = lazy(() => import("@/features/accounts/CreateAccountPage"));
const AccountPage = lazy(() => import("@/features/accounts/AccountPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [
  { path: "accounts", element: <AccountsPage /> },
  { path: "accounts/new", element: <CreateAccountPage /> },
  { path: "accounts/:id", element: <AccountPage /> },
  { path: "security-log", element: <AuditLogPage category="security" /> },
];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose run --rm web npx vitest run src/features/accounts`
Expected: PASS, 4 files; `AccountPage.test.tsx` has 9 tests.

- [ ] **Step 7: See it in the browser, then commit**

Sign in as `sysadmin@impactrisks.com`, open "Comptes", open `hr@impactrisks.com`.
Expected: the state, roles and last sign-in first; "Détails" opens the history; "Modifier les rôles" explains why System Administrator cannot be added to an HR account; your own account shows no action.

```bash
git add frontend/src/features/accounts frontend/src/workspaces/admin/routes.tsx
git commit -m "feat(frontend): account page with reset, unlock, disable and role changes"
```

---

### Task 20: Administration: Parameters

**Files:**
- Create: `frontend/src/features/settings/api.ts`, `frontend/src/features/settings/settingValues.ts`, `frontend/src/features/settings/SettingsGroupPage.tsx`
- Create: `frontend/src/i18n/locales/fr/settings.json`, `frontend/src/i18n/locales/en/settings.json`
- Modify: `frontend/src/workspaces/admin/routes.tsx` (replace)
- Test: `frontend/src/features/settings/settingValues.test.ts`, `frontend/src/features/settings/SettingsGroupPage.test.tsx`

**Interfaces:**
- Consumes: `GET settings/system`, `GET settings/hr`, `PUT settings/<group>/{key}` with `{value}` (master 7.4). From plan 01a: `SettingOut` carries `choices` (a list or null); a decimal travels as a string (`"2.5"`), an integer as a number, a weekday set as a list of ISO numbers, a date as `YYYY-MM-DD` or null; refusals are `settings.invalid_value` and `settings.out_of_range` on the field `value`.
- Produces:
  - `SettingsGroup = "hr" | "system"`, `settingKeys`, `useSettings(group)`, `useSaveSetting(group)` from `@/features/settings/api`.
  - `toField`, `fromField`, `sameValue`, `displayValue` from `@/features/settings/settingValues`: conversion between the API value and what a control holds, for the seven kinds.
  - **Extension point** `SettingsGroupPage` (default export, `{ group: "hr" | "system"; readOnly?: boolean }`). It draws whatever the group returns, one control per kind. A plan that registers a setting adds two texts to both `settings.json` files, `<key>.label` and `<key>.hint`; without them the page shows the key.
  - The page registered at `parameters` in `adminRoutes` for the system group; the `settings` namespace with the seven system keys.

- [ ] **Step 1: Write the translation files**

`frontend/src/i18n/locales/en/settings.json`:

```json
{
  "title": {
    "system": "Parameters",
    "hr": "Parameters"
  },
  "save": "Save the changes",
  "changedBy": "Last changed by {{by}} on {{when}}.",
  "changedOn": "Last changed on {{when}}.",
  "neverChanged": "Default value, never changed.",
  "none": "None",
  "range": "Between {{min}} and {{max}}.",
  "errors": {
    "whole": "Enter a whole number.",
    "number": "Enter a number.",
    "range": "Enter a value between {{min}} and {{max}}.",
    "weekdays": "Choose at least one day.",
    "list": "Choose at least one.",
    "date": "Enter a valid date."
  },
  "session_timeout_minutes": {
    "label": "Inactivity limit (minutes)",
    "hint": "A session ends after this long without activity."
  },
  "lockout_threshold": {
    "label": "Failed attempts before lock-out",
    "hint": "Wrong passwords in a row before an account is locked."
  },
  "lockout_minutes": {
    "label": "Lock-out duration (minutes)",
    "hint": "How long a locked account stays locked."
  },
  "login_ip_max_attempts": {
    "label": "Failed attempts per network address",
    "hint": "Failed sign-ins from one address, within the lock-out duration, before that address is refused."
  },
  "temp_password_hours": {
    "label": "Temporary-password lifetime (hours)",
    "hint": "A temporary password that is not used within this time expires."
  },
  "upload_max_mb": {
    "label": "Maximum upload size (MB)",
    "hint": "The largest file a person can attach."
  },
  "upload_allowed_types": {
    "label": "Accepted file types",
    "hint": "A file of another type is refused."
  }
}
```

`frontend/src/i18n/locales/fr/settings.json`:

```json
{
  "title": {
    "system": "Paramètres",
    "hr": "Paramètres"
  },
  "save": "Enregistrer les modifications",
  "changedBy": "Dernière modification par {{by}} le {{when}}.",
  "changedOn": "Dernière modification le {{when}}.",
  "neverChanged": "Valeur par défaut, jamais modifiée.",
  "none": "Aucune",
  "range": "Entre {{min}} et {{max}}.",
  "errors": {
    "whole": "Saisissez un nombre entier.",
    "number": "Saisissez un nombre.",
    "range": "Saisissez une valeur entre {{min}} et {{max}}.",
    "weekdays": "Choisissez au moins un jour.",
    "list": "Choisissez-en au moins un.",
    "date": "Saisissez une date valide."
  },
  "session_timeout_minutes": {
    "label": "Limite d'inactivité (minutes)",
    "hint": "Une session se termine après cette durée sans activité."
  },
  "lockout_threshold": {
    "label": "Échecs avant verrouillage",
    "hint": "Nombre de mots de passe erronés consécutifs avant le verrouillage d'un compte."
  },
  "lockout_minutes": {
    "label": "Durée du verrouillage (minutes)",
    "hint": "Durée pendant laquelle un compte verrouillé le reste."
  },
  "login_ip_max_attempts": {
    "label": "Échecs par adresse réseau",
    "hint": "Nombre d'échecs de connexion depuis une même adresse, pendant la durée du verrouillage, avant que cette adresse soit refusée."
  },
  "temp_password_hours": {
    "label": "Durée de vie du mot de passe temporaire (heures)",
    "hint": "Un mot de passe temporaire non utilisé dans ce délai expire."
  },
  "upload_max_mb": {
    "label": "Taille maximale d'un fichier (Mo)",
    "hint": "Le plus gros fichier qu'une personne peut joindre."
  },
  "upload_allowed_types": {
    "label": "Types de fichiers acceptés",
    "hint": "Un fichier d'un autre type est refusé."
  }
}
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/settings/settingValues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { displayValue, fromField, sameValue, toField } from "./settingValues";

const def = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, minimum: null, maximum: null, choices: null, ...extra }) as Parameters<typeof fromField>[0];

describe("toField", () => {
  it("turns an API value into what a control holds", () => {
    expect(toField({ kind: "int", value: 120, choices: null })).toBe("120");
    expect(toField({ kind: "decimal", value: "2.5", choices: null })).toBe("2.5");
    expect(toField({ kind: "bool", value: true, choices: null })).toBe(true);
    expect(toField({ kind: "weekdays", value: [1, 2, 3], choices: null })).toEqual(["1", "2", "3"]);
    expect(toField({ kind: "str_list", value: ["pdf", "png"], choices: ["pdf", "jpg", "png"] })).toEqual(["pdf", "png"]);
    expect(toField({ kind: "str_list", value: ["a", "b"], choices: null })).toBe("a, b");
    expect(toField({ kind: "int_or_null", value: null, choices: null })).toBe("");
    expect(toField({ kind: "date_or_null", value: "2026-11-01", choices: null })).toBe("2026-11-01");
  });
});

describe("fromField", () => {
  it("sends each kind in the JSON type the API expects", () => {
    expect(fromField(def("int"), " 90 ")).toEqual({ ok: true, value: 90 });
    expect(fromField(def("decimal"), "3,5")).toEqual({ ok: true, value: "3.5" });
    expect(fromField(def("bool"), true)).toEqual({ ok: true, value: true });
    expect(fromField(def("weekdays"), ["6", "1", "2"])).toEqual({ ok: true, value: [1, 2, 6] });
    expect(fromField(def("str_list", { choices: ["pdf", "jpg"] }), ["jpg"])).toEqual({ ok: true, value: ["jpg"] });
    expect(fromField(def("str_list"), " A , b ,, ")).toEqual({ ok: true, value: ["a", "b"] });
    expect(fromField(def("int_or_null"), "")).toEqual({ ok: true, value: null });
    expect(fromField(def("int_or_null"), "25")).toEqual({ ok: true, value: 25 });
    expect(fromField(def("date_or_null"), "")).toEqual({ ok: true, value: null });
    expect(fromField(def("date_or_null"), "2026-11-01")).toEqual({ ok: true, value: "2026-11-01" });
  });

  it("names what is wrong with a value", () => {
    expect(fromField(def("int"), "abc")).toEqual({ ok: false, error: "whole" });
    expect(fromField(def("int"), "2.5")).toEqual({ ok: false, error: "whole" });
    expect(fromField(def("int"), "")).toEqual({ ok: false, error: "whole" });
    expect(fromField(def("int", { minimum: 5, maximum: 1440 }), "2000")).toEqual({ ok: false, error: "range" });
    expect(fromField(def("int", { minimum: 5, maximum: 1440 }), "4")).toEqual({ ok: false, error: "range" });
    expect(fromField(def("decimal"), "deux")).toEqual({ ok: false, error: "number" });
    expect(fromField(def("decimal", { minimum: "0", maximum: "10" }), "10.5")).toEqual({ ok: false, error: "range" });
    expect(fromField(def("weekdays"), [])).toEqual({ ok: false, error: "weekdays" });
    expect(fromField(def("str_list", { choices: ["pdf"] }), [])).toEqual({ ok: false, error: "list" });
    expect(fromField(def("date_or_null"), "2026-02-30")).toEqual({ ok: false, error: "date" });
  });
});

describe("sameValue and displayValue", () => {
  it("compares what controls hold", () => {
    expect(sameValue("120", "120")).toBe(true);
    expect(sameValue(["1", "2"], ["1", "2"])).toBe(true);
    expect(sameValue(["1", "2"], ["2", "1"])).toBe(false);
    expect(sameValue(true, false)).toBe(false);
  });

  it("writes a value for reading", () => {
    const show = (kind: string, value: unknown, choices: string[] | null = null) => displayValue({ kind, value, choices } as Parameters<typeof displayValue>[0], i18n.t, "fr").replace(/\s/g, " ");
    expect(show("int", 120)).toBe("120");
    expect(show("decimal", "2.5")).toBe("2,5");
    expect(show("bool", true)).toBe("Oui");
    expect(show("weekdays", [1, 2])).toBe("Lundi, Mardi");
    expect(show("str_list", ["pdf", "png"], ["pdf", "jpg", "png"])).toBe("PDF, PNG");
    expect(show("int_or_null", null)).toBe("Aucune");
    expect(show("date_or_null", "2026-11-01")).toBe("1 nov. 2026");
  });
});
```

`frontend/src/features/settings/SettingsGroupPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/settings`
Expected: FAIL with `Failed to resolve import "./settingValues"` and `"./SettingsGroupPage"`.

- [ ] **Step 4: Write the hooks and the conversions**

`frontend/src/features/settings/api.ts`:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";

export type SettingsGroup = "hr" | "system";

export const settingKeys = {
  group: (group: SettingsGroup) => ["settings", group] as const,
};

export function useSettings(group: SettingsGroup) {
  return useQuery({
    queryKey: settingKeys.group(group),
    queryFn: () => (group === "system" ? call(api.GET("/api/v1/settings/system")) : call(api.GET("/api/v1/settings/hr"))),
  });
}

/** Saves one setting. The caller reads the group again when it has saved everything that changed. */
export function useSaveSetting(group: SettingsGroup) {
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => {
      const options = { params: { path: { key } }, body: { value } };
      return group === "system" ? call(api.PUT("/api/v1/settings/system/{key}", options)) : call(api.PUT("/api/v1/settings/hr/{key}", options));
    },
  });
}
```

`frontend/src/features/settings/settingValues.ts`:

```ts
import type { TFunction } from "i18next";
import type { Setting } from "@/api/types";
import type { Lang } from "@/i18n";
import { isISODate } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";

/** What a control holds: text, a switch position, or the ticked choices. */
export type FieldValue = string | boolean | string[];

export type Parsed = { ok: true; value: unknown } | { ok: false; error: "whole" | "number" | "range" | "weekdays" | "list" | "date" };

type Shape = Pick<Setting, "kind" | "value" | "choices">;
type Limits = Pick<Setting, "kind" | "minimum" | "maximum" | "choices">;

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** From the API value to what the control holds. */
export function toField(setting: Shape): FieldValue {
  const { kind, value, choices } = setting;
  if (kind === "bool") return value === true;
  if (kind === "weekdays") return asList(value);
  if (kind === "str_list") return choices ? asList(value) : asList(value).join(", ");
  return value === null || value === undefined ? "" : String(value);
}

function outside(amount: number, setting: Limits): boolean {
  const { minimum, maximum } = setting;
  return (minimum !== null && minimum !== undefined && amount < Number(minimum)) || (maximum !== null && maximum !== undefined && amount > Number(maximum));
}

function whole(text: string, setting: Limits): Parsed {
  if (!/^-?\d+$/.test(text)) return { ok: false, error: "whole" };
  const amount = Number(text);
  return outside(amount, setting) ? { ok: false, error: "range" } : { ok: true, value: amount };
}

/** From what the control holds to the JSON the API expects for that kind, or what is wrong with it. */
export function fromField(setting: Limits, field: FieldValue): Parsed {
  const text = typeof field === "string" ? field.trim() : "";
  switch (setting.kind) {
    case "bool":
      return { ok: true, value: field === true };
    case "int":
      return whole(text, setting);
    case "int_or_null":
      return text === "" ? { ok: true, value: null } : whole(text, setting);
    case "decimal": {
      const normal = text.replace(",", ".");
      if (!/^-?\d+(\.\d+)?$/.test(normal)) return { ok: false, error: "number" };
      return outside(Number(normal), setting) ? { ok: false, error: "range" } : { ok: true, value: normal };
    }
    case "weekdays": {
      const days = asList(field).map(Number).sort((a, b) => a - b);
      return days.length === 0 ? { ok: false, error: "weekdays" } : { ok: true, value: days };
    }
    case "str_list": {
      if (setting.choices) {
        const chosen = asList(field);
        return chosen.length === 0 ? { ok: false, error: "list" } : { ok: true, value: chosen };
      }
      return { ok: true, value: text.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean) };
    }
    case "date_or_null":
      if (text === "") return { ok: true, value: null };
      return isISODate(text) ? { ok: true, value: text } : { ok: false, error: "date" };
    default:
      return { ok: true, value: field };
  }
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A value written for reading, on the read-only page. */
export function displayValue(setting: Shape, t: TFunction, lang: Lang): string {
  const { kind, value } = setting;
  if (value === null || value === undefined) return t("settings:none");
  if (kind === "bool") return value === true ? t("state.yes") : t("state.no");
  if (kind === "weekdays") return asList(value).map((day) => t(`weekdays.${day}`)).join(", ");
  if (kind === "str_list") return asList(value).map((entry) => entry.toUpperCase()).join(", ") || t("settings:none");
  if (kind === "date_or_null") return formatDate(String(value), lang);
  if (kind === "decimal") return formatNumber(String(value), lang);
  return String(value);
}
```

- [ ] **Step 5: Write the page**

`frontend/src/features/settings/SettingsGroupPage.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { problemText } from "@/api/problemText";
import type { Setting } from "@/api/types";
import { describedBy, Field } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { settingKeys, useSaveSetting, useSettings, type SettingsGroup } from "./api";
import { displayValue, fromField, sameValue, toField, type FieldValue } from "./settingValues";

type Values = Record<string, FieldValue>;

const NONE: Setting[] = [];
const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"];

interface ControlProps {
  setting: Setting;
  label: string;
  hint?: string;
  error?: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  onBlur: () => void;
}

/** Several choices ticked at once: the days of the week, or the values the setting allows. */
function Choices({ label, hint, error, value, onChange, options }: ControlProps & { options: { value: string; label: string }[] }) {
  const id = useId();
  const chosen = Array.isArray(value) ? value : [];
  const toggle = (option: string, checked: boolean) => {
    const next = checked ? [...chosen, option] : chosen.filter((entry) => entry !== option);
    onChange(options.map((entry) => entry.value).filter((entry) => next.includes(entry)));
  };
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" aria-describedby={describedBy(id, hint, error)}>
      <legend className="mb-1 p-0 text-body font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-x-6">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-foreground md:min-h-8">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={chosen.includes(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption font-medium text-refused">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** One control per kind of setting (master 6.7). */
function SettingControl(props: ControlProps) {
  const { setting, label, hint, error, value, onChange, onBlur } = props;
  const { t } = useTranslation();
  const id = useId();

  if (setting.kind === "bool") {
    return (
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label htmlFor={id}>{label}</Label>
          {hint && (
            <p id={`${id}-hint`} className="text-caption text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={onChange} onBlur={onBlur} aria-describedby={hint ? `${id}-hint` : undefined} />
      </div>
    );
  }
  if (setting.kind === "weekdays") {
    return <Choices {...props} options={WEEKDAYS.map((day) => ({ value: day, label: t(`weekdays.${day}`) }))} />;
  }
  if (setting.kind === "str_list" && setting.choices) {
    return <Choices {...props} options={setting.choices.map((choice) => ({ value: choice, label: choice.toUpperCase() }))} />;
  }
  const numeric = setting.kind === "int" || setting.kind === "int_or_null" || setting.kind === "decimal";
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input
        id={id}
        type={setting.kind === "date_or_null" ? "date" : "text"}
        inputMode={setting.kind === "decimal" ? "decimal" : numeric ? "numeric" : undefined}
        className={numeric ? "tabular md:w-40" : setting.kind === "date_or_null" ? "md:w-56" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Field>
  );
}

/**
 * The settings of one group (ADM-05, ADM-06): whatever the API returns for it, one control per kind.
 * "Save" exists only while something differs from what is stored.
 */
export default function SettingsGroupPage({ group, readOnly = false }: { group: SettingsGroup; readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const queryClient = useQueryClient();
  const settings = useSettings(group);
  const save = useSaveSetting(group);
  const rows = settings.data ?? NONE;

  const storedValues = useMemo<Values>(() => Object.fromEntries(rows.map((setting) => [setting.key, toField(setting)])), [rows]);
  // After a save the group is read again: untouched controls take the stored value, typed ones keep what was typed.
  const form = useForm<Values>({ values: storedValues, resetOptions: { keepDirtyValues: true, keepErrors: true } });
  const held = useWatch({ control: form.control });
  const sending = form.formState.isSubmitting;

  const title = t(`settings:title.${group}`);
  if (settings.isPending) {
    return (
      <>
        <PageHeader title={title} />
        <PageLoading />
      </>
    );
  }
  if (settings.error) throw settings.error;

  const text = (key: string, fallback?: string) => (i18n.exists(key) ? t(key) : fallback);
  const hintOf = (setting: Setting) => {
    const parts = [text(`settings:${setting.key}.hint`)];
    if (setting.minimum !== null && setting.maximum !== null && setting.minimum !== undefined && setting.maximum !== undefined) {
      parts.push(t("settings:range", { min: String(setting.minimum), max: String(setting.maximum) }));
    }
    return parts.filter(Boolean).join(" ") || undefined;
  };
  const changeOf = (setting: Setting) => {
    if (!setting.updated_at) return t("settings:neverChanged");
    const when = formatDateTime(setting.updated_at, lang);
    return setting.updated_by ? t("settings:changedBy", { by: setting.updated_by, when }) : t("settings:changedOn", { when });
  };
  const messageOf = (error: "whole" | "number" | "range" | "weekdays" | "list" | "date", setting: Setting) =>
    t(`settings:errors.${error}`, { min: String(setting.minimum), max: String(setting.maximum) });

  if (readOnly) {
    return (
      <>
        <PageHeader title={title} />
        <dl className="flex max-w-2xl flex-col">
          {rows.map((setting) => (
            <div key={setting.key} className="border-t border-divider py-4">
              <dt className="text-body font-medium text-foreground">{text(`settings:${setting.key}.label`, setting.key)}</dt>
              <dd className="m-0 mt-1 text-body text-foreground">{displayValue(setting, t, lang)}</dd>
              <dd className="m-0 mt-1 text-caption text-muted-foreground">{changeOf(setting)}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  }

  const changed = rows.filter((setting) => held[setting.key] !== undefined && !sameValue(held[setting.key] as FieldValue, storedValues[setting.key]));

  const submit = form.handleSubmit(async (values) => {
    let failed = false;
    for (const setting of changed) {
      const parsed = fromField(setting, values[setting.key]);
      if (!parsed.ok) {
        form.setError(setting.key, { type: "validate", message: messageOf(parsed.error, setting) });
        failed = true;
        continue;
      }
      try {
        await save.mutateAsync({ key: setting.key, value: parsed.value });
      } catch (error) {
        form.setError(setting.key, { type: "server", message: problemText(error, t) });
        failed = true;
      }
    }
    await queryClient.invalidateQueries({ queryKey: settingKeys.group(group) });
    if (!failed) toast(t("saved"));
  });

  return (
    <>
      <PageHeader title={title} />
      <form
        noValidate
        className="max-w-2xl"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <ul className="flex flex-col">
          {rows.map((setting) => (
            <li key={setting.key} className="flex flex-col gap-1 border-t border-divider py-4">
              <Controller
                control={form.control}
                name={setting.key}
                render={({ field, fieldState }) => (
                  <SettingControl
                    setting={setting}
                    label={text(`settings:${setting.key}.label`, setting.key) ?? setting.key}
                    hint={hintOf(setting)}
                    error={fieldState.error?.message}
                    value={(field.value as FieldValue | undefined) ?? toField(setting)}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <p className="text-caption text-muted-foreground">{changeOf(setting)}</p>
            </li>
          ))}
        </ul>
        {changed.length > 0 && (
          <div className="sticky bottom-20 mt-4 md:bottom-4">
            <Button type="submit" variant="primary" aria-busy={sending}>
              {t("settings:save")}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
```

- [ ] **Step 6: Register the page**

Replace `frontend/src/workspaces/admin/routes.tsx` with:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AccountsPage = lazy(() => import("@/features/accounts/AccountsPage"));
const CreateAccountPage = lazy(() => import("@/features/accounts/CreateAccountPage"));
const AccountPage = lazy(() => import("@/features/accounts/AccountPage"));
const SettingsGroupPage = lazy(() => import("@/features/settings/SettingsGroupPage"));
const AuditLogPage = lazy(() => import("@/features/audit/AuditLogPage"));

// Pages of Administration, with paths relative to /admin. A plan adds a page by appending an element.
export const adminRoutes: RouteObject[] = [
  { path: "accounts", element: <AccountsPage /> },
  { path: "accounts/new", element: <CreateAccountPage /> },
  { path: "accounts/:id", element: <AccountPage /> },
  { path: "parameters", element: <SettingsGroupPage group="system" /> },
  { path: "security-log", element: <AuditLogPage category="security" /> },
];
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/settings src/i18n/parity.test.ts`
Expected: PASS; `settingValues.test.ts` has 5 tests, `SettingsGroupPage.test.tsx` has 6, and parity now covers `settings`.

If TypeScript rejects `body: { value }` in `api.ts`, the generated type of the request body is narrower than "any JSON": check that `SettingValueIn.value` is a `JSONField` in plan 01a and regenerate the types.

- [ ] **Step 8: Run the whole frontend suite, then commit**

Run: `docker compose run --rm web npm test`, `docker compose run --rm web npm run lint`, `docker compose run --rm web npm run typecheck` and `docker compose run --rm web npm run build`
Expected: every test file passes; lint and types are clean; the build succeeds.

Then sign in as `sysadmin@impactrisks.com`: Administration now shows its four entries (État, Comptes, Paramètres, Journal de sécurité). Change the inactivity limit to 90 and save: the page says "Enregistré.", the line under the field names you and the time, and the security log shows "Paramètre modifié".

```bash
git add frontend/src/features/settings frontend/src/i18n/locales frontend/src/workspaces/admin/routes.tsx
git commit -m "feat(frontend): parameters page that draws any settings group by kind"
```

---

### Task 21: The proxy image and the server stack

**Files:**
- Create: `proxy/Dockerfile`, `proxy/Dockerfile.dockerignore`, `proxy/Caddyfile`, `proxy/tls.caddy`, `proxy/entrypoint.sh`, `proxy/maintenance.html`, `proxy/certs/.gitignore`
- Create: `compose.server.yaml`
- Test: `proxy/tests/smoke.sh`

**Interfaces:**
- Consumes: `compose.yaml` from plan 01a, which gives `app` and `worker` neither `image` nor `build` (its contract note 21); the variables `IMAGE_PREFIX`, `APP_VERSION`, `SITE_HOSTNAME`, `HTTPS_PORT`, `HTTP_PORT` of `.env.example`; Django's `SECURE_PROXY_SSL_HEADER`, which trusts `X-Forwarded-Proto` from the proxy (plan 01a, note 22); the frontend build (`npm run build`).
- Produces:
  - Image `${IMAGE_PREFIX}-proxy:${APP_VERSION}`: Caddy with the built application in `/srv/app`. It listens on `HTTPS_PORT` and `HTTP_PORT` inside the container (so that its redirect from HTTP carries the right port), serves `SITE_HOSTNAME`, forwards `/api/*` to `app:8000` and answers every other address with the single-page application.
  - HTTPS with Caddy's internal authority by default; with the certificate in `proxy/certs/site.crt` and `proxy/certs/site.key` when both files exist on the server.
  - HSTS, a content-security policy, clickjacking and no-sniff headers; no `Server` header.
  - While the application container is away, every `/api` call answers 503 with the bilingual "being updated" page and `Retry-After: 15`. The React application reads that as "unavailable" (Task 2) and shows its own "being updated" page (Task 9).
  - `compose.server.yaml`: registry images for `app`, `worker` and `proxy`, `restart: unless-stopped` everywhere, only the proxy's two ports published.

- [ ] **Step 1: Write the failing test**

`proxy/tests/smoke.sh`:

```bash
#!/usr/bin/env bash
# Builds the proxy image and probes it over HTTPS.
# Run from the repository root:  bash proxy/tests/smoke.sh
set -euo pipefail

# Git Bash on Windows rewrites arguments that look like paths; Docker needs them as written.
export MSYS_NO_PATHCONV=1
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

IMAGE="iris-hr-proxy:smoke"
NET="iris-proxy-smoke"
HOST="hr.smoke.test"
HTTPS=18443
HTTP=18080
TMP="$(mktemp -d)"

cleanup() {
  docker rm -f iris-proxy-smoke iris-proxy-certs iris-proxy-upstream >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
docker rm -f iris-proxy-smoke iris-proxy-certs iris-proxy-upstream >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true

echo "building $IMAGE ..."
docker build --quiet -f proxy/Dockerfile -t "$IMAGE" . >/dev/null
docker network create "$NET" >/dev/null

run_proxy() { # name
  docker create --name "$1" --network "$NET" \
    -e SITE_HOSTNAME="$HOST" -e HTTPS_PORT="$HTTPS" -e HTTP_PORT="$HTTP" \
    -p "127.0.0.1:$HTTPS:$HTTPS" -p "127.0.0.1:$HTTP:$HTTP" "$IMAGE" >/dev/null
}
get() { curl --silent --max-time 5 --resolve "$HOST:$HTTPS:127.0.0.1" --resolve "$HOST:$HTTP:127.0.0.1" "$@"; }
wait_up() { for _ in $(seq 1 40); do get --insecure -o /dev/null "https://$HOST:$HTTPS/" && return 0; sleep 1; done; echo "the proxy did not start"; docker logs "$1" || true; exit 1; }

failures=0
check() { # description, command...
  local description="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok    $description"; else echo "FAIL  $description"; failures=$((failures + 1)); fi
}
has() { grep -qi -- "$2" <<<"$1"; }
lacks() { ! grep -qi -- "$2" <<<"$1"; }

# --- 1. the internal authority, no application behind ---
run_proxy iris-proxy-smoke
docker start iris-proxy-smoke >/dev/null
wait_up iris-proxy-smoke

home="$(get --insecure "https://$HOST:$HTTPS/")"
deep="$(get --insecure "https://$HOST:$HTTPS/admin/accounts/abc")"
headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/")"
asset_status="$(get --insecure -o /dev/null -w '%{http_code}' "https://$HOST:$HTTPS/assets/does-not-exist.js")"
down_status="$(get --insecure -o /dev/null -w '%{http_code}' "https://$HOST:$HTTPS/api/v1/health")"
down_body="$(get --insecure "https://$HOST:$HTTPS/api/v1/health")"
down_headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/api/v1/health")"
redirect="$(get -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST:$HTTP/admin?x=1")"

check "serves the application at the root"                  has "$home" '<div id="root">'
check "serves the application for a deep link"              has "$deep" '<div id="root">'
check "sends HSTS"                                           has "$headers" 'strict-transport-security: max-age=31536000'
check "sends a content-security policy without inline scripts" has "$headers" "content-security-policy: default-src 'self'; script-src 'self';"
check "forbids framing"                                      has "$headers" 'x-frame-options: DENY'
check "forbids content sniffing"                             has "$headers" 'x-content-type-options: nosniff'
check "does not name the server software"                    lacks "$headers" '^server:'
check "does not cache the page itself"                       has "$headers" 'cache-control: no-cache'
check "answers 404 for a missing asset, not the application" test "$asset_status" = "404"
check "answers 503 while the application is away"            test "$down_status" = "503"
check "explains it in French"                                has "$down_body" 'Mise à jour en cours'
check "explains it in English"                               has "$down_body" 'Being updated'
check "says when to try again"                               has "$down_headers" 'retry-after: 15'
check "redirects HTTP to HTTPS on the published port"        test "$redirect" = "308 https://$HOST:$HTTPS/admin?x=1"

# --- 2. with an application behind ---
docker run -d --name iris-proxy-upstream --network "$NET" --network-alias app --entrypoint caddy "$IMAGE" \
  respond --listen :8000 --body '{"status":"ok"}' >/dev/null
sleep 2
up_body="$(get --insecure "https://$HOST:$HTTPS/api/v1/health")"
check "forwards /api to the application"                     test "$up_body" = '{"status":"ok"}'

# --- 3. a supplied certificate ---
docker rm -f iris-proxy-smoke >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$HOST" -addext "subjectAltName=DNS:$HOST" \
  -keyout "$TMP/site.key" -out "$TMP/site.crt" >/dev/null 2>&1
run_proxy iris-proxy-certs
docker cp "$(native "$TMP/site.crt")" iris-proxy-certs:/certs/site.crt
docker cp "$(native "$TMP/site.key")" iris-proxy-certs:/certs/site.key
docker start iris-proxy-certs >/dev/null
wait_up iris-proxy-certs
check "uses the supplied certificate when there is one"      get --fail --cacert "$TMP/site.crt" -o /dev/null "https://$HOST:$HTTPS/"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "proxy smoke test: all passed"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash proxy/tests/smoke.sh`
Expected: FAIL at the build, with `unable to prepare context` or `failed to read dockerfile: open proxy/Dockerfile: no such file or directory`.

- [ ] **Step 3: Write the image**

`proxy/Dockerfile` (the build context is the repository root):

```dockerfile
# syntax=docker/dockerfile:1

# Stage 1: build the React application.
FROM node:24-bookworm-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Caddy with the built application.
FROM caddy:2-alpine
RUN mkdir -p /certs /srv/app /srv/maintenance
COPY proxy/Caddyfile /etc/caddy/Caddyfile
COPY proxy/tls.caddy /etc/caddy/tls.caddy
COPY proxy/maintenance.html /srv/maintenance/maintenance.html
COPY proxy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY --from=build /src/frontend/dist /srv/app
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

`proxy/Dockerfile.dockerignore`:

```gitignore
# Only the frontend sources and this folder are needed to build the proxy image.
*
!frontend
!proxy
frontend/node_modules
frontend/dist
frontend/playwright-report
frontend/test-results
proxy/tests
proxy/certs
```

`proxy/tls.caddy` (the default; the entry point rewrites it when a certificate is supplied):

```
tls internal
```

`proxy/entrypoint.sh`:

```sh
#!/bin/sh
# Chooses the certificate: the one supplied in /certs when both files are there,
# Caddy's internal authority otherwise. Then starts Caddy.
set -eu

if [ -s /certs/site.crt ] && [ -s /certs/site.key ]; then
  printf 'tls /certs/site.crt /certs/site.key\n' > /etc/caddy/tls.caddy
else
  printf 'tls internal\n' > /etc/caddy/tls.caddy
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
```

`proxy/Caddyfile`:

```
{
	admin off
	# The container listens on the published ports, so the redirect from HTTP names the right one.
	http_port {$HTTP_PORT:80}
	https_port {$HTTPS_PORT:443}
}

{$SITE_HOSTNAME:localhost} {
	import /etc/caddy/tls.caddy
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "same-origin"
		-Server
	}

	# The API. Caddy passes the Host header through and sets X-Forwarded-For and X-Forwarded-Proto
	# itself; Django's origin check and the audit trail's network address rely on both.
	handle /api/* {
		reverse_proxy app:8000
	}

	# Fingerprinted files: cached for good, and a missing one is a 404, not the application.
	handle /assets/* {
		root * /srv/app
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	# Everything else is the single-page application.
	handle {
		root * /srv/app
		# No inline script, no other origin. Inline style attributes are allowed because the
		# interface primitives position menus and sheets with them.
		header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		header Permissions-Policy "camera=(), microphone=(), geolocation=()"
		header Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}

	handle_errors {
		# The application container is restarting or being updated.
		@away expression `{err.status_code} in [502, 503, 504]`
		handle @away {
			root * /srv/maintenance
			rewrite * /maintenance.html
			header Retry-After "15"
			header Cache-Control "no-store"
			file_server {
				status 503
			}
		}
		handle {
			respond "{err.status_code} {err.status_text}" {err.status_code}
		}
	}
}
```

`proxy/maintenance.html`:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="15" />
    <title>IRIS HR</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #F3F5F8; color: #101828; font-family: "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 20px; }
      main { max-width: 384px; margin: 16px; padding: 24px; background: #FFFFFF; border: 1px solid #E4E7EC; border-radius: 12px; }
      h1 { margin: 0 0 8px; font-size: 24px; line-height: 32px; font-weight: 600; }
      p { margin: 0 0 16px; color: #344054; }
      section + section { border-top: 1px solid #EEF0F3; padding-top: 16px; }
      section:last-child p { margin-bottom: 0; }
    </style>
  </head>
  <body>
    <main>
      <section lang="fr">
        <h1>Mise à jour en cours</h1>
        <p>L'application est en cours de mise à jour et sera de retour dans un instant. Cette page vérifie d'elle-même.</p>
      </section>
      <section lang="en">
        <h1>Being updated</h1>
        <p>The application is being updated and will be back shortly. This page checks again by itself.</p>
      </section>
    </main>
  </body>
</html>
```

`proxy/certs/.gitignore` (the folder exists in the repository, its content never does):

```gitignore
*
!.gitignore
```

- [ ] **Step 4: Write `compose.server.yaml`**

```yaml
# Server overrides, for the test stack and for the production stack:
# images from the registry, the proxy, restart policies.
# Only the proxy publishes ports. The application and the database are reachable from inside the stack only.

services:
  db:
    restart: unless-stopped

  app:
    image: ${IMAGE_PREFIX:?set IMAGE_PREFIX in .env}-backend:${APP_VERSION:?set APP_VERSION in .env}
    restart: unless-stopped

  worker:
    image: ${IMAGE_PREFIX:?set IMAGE_PREFIX in .env}-backend:${APP_VERSION:?set APP_VERSION in .env}
    restart: unless-stopped

  proxy:
    image: ${IMAGE_PREFIX:?set IMAGE_PREFIX in .env}-proxy:${APP_VERSION:?set APP_VERSION in .env}
    restart: unless-stopped
    depends_on:
      - app
    environment:
      SITE_HOSTNAME: ${SITE_HOSTNAME:?set SITE_HOSTNAME in .env}
      HTTPS_PORT: ${HTTPS_PORT:-443}
      HTTP_PORT: ${HTTP_PORT:-80}
    ports:
      - "${HTTPS_PORT:-443}:${HTTPS_PORT:-443}"
      - "${HTTP_PORT:-80}:${HTTP_PORT:-80}"
    volumes:
      - caddy_data:/data
      - caddy_config:/config
      # Put site.crt and site.key here to use the company's certificate instead of Caddy's own authority.
      - ./proxy/certs:/certs:ro

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 5: Mark the scripts as executable and check their line endings**

Git on Windows does not record the executable bit by itself:

```bash
git add proxy compose.server.yaml
git update-index --chmod=+x proxy/entrypoint.sh proxy/tests/smoke.sh
git ls-files --eol proxy/entrypoint.sh proxy/tests/smoke.sh proxy/Caddyfile
```

Expected: the three lines start with `i/lf`. A line starting with `i/crlf` means `.gitattributes` from plan 01a is not being applied to that file: run `git add --renormalize proxy` and look again.

- [ ] **Step 6: Run the test to verify it passes**

Run: `bash proxy/tests/smoke.sh`
Expected: sixteen lines starting with `ok`, then `proxy smoke test: all passed`. The first run builds the frontend inside Docker and takes a few minutes.

If `caddy` refuses the configuration (the container exits and `docker logs` shows a line and column of the Caddyfile), check it alone:

```
docker run --rm -e SITE_HOSTNAME=hr.smoke.test --entrypoint caddy iris-hr-proxy:smoke validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Expected: `Valid configuration`. If it names a directive it does not accept, compare that directive with its page at caddyserver.com/docs/caddyfile/directives (`file_server` for `status`, `handle_errors` for the `{err.status_code}` placeholder) for the installed version, correct the Caddyfile and run the smoke test again: its sixteen checks say when the behaviour is right.

- [ ] **Step 7: Check that the server stack is well formed**

Run: `docker compose -f compose.yaml -f compose.server.yaml config --quiet`
Expected: no output and exit code 0 (the development `.env` supplies every variable).

Run: `docker compose -f compose.yaml -f compose.server.yaml config --format json | docker run --rm -i node:24-bookworm-slim node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8'));const s=c.services;const published=Object.entries(s).filter(([,v])=>v.ports&&v.ports.length).map(([k])=>k);if(JSON.stringify(published)!==JSON.stringify(['proxy']))throw new Error('ports published by: '+published);for(const n of ['app','worker','proxy','db'])if(s[n].restart!=='unless-stopped')throw new Error(n+' has no restart policy');if(!/-backend:/.test(s.app.image)||!/-proxy:/.test(s.proxy.image))throw new Error('images are not the registry images');console.log('server stack ok')"`
Expected: `server stack ok`.

- [ ] **Step 8: Commit**

```bash
git add proxy compose.server.yaml
git commit -m "feat(proxy): Caddy image with HTTPS, security headers, API forwarding and a maintenance page"
```

---

### Task 22: The server update command

**Files:**
- Create: `scripts/server/lib.sh`, `scripts/server/check-env.sh`, `scripts/server/dump.sh`, `scripts/server/compose.sh`, `scripts/server/update.sh`, `scripts/server/state/.gitignore`
- Test: `scripts/server/tests/check-env.test.sh`, `scripts/server/tests/update.test.sh`

**Interfaces:**
- Consumes: `.env.example` and `compose.yaml` from plan 01a (every variable reaches the containers through `${NAME}` in the compose files, so a value exported in the shell wins over the one in `.env`); the backend image, which carries `pg_dump` 17 and `gpg`; `compose.server.yaml` and the proxy (Task 21); `GET /api/v1/health`, which answers 503 until the worker's first heartbeat, up to about 90 seconds after a restart (plan 01a, note 23).
- Produces:
  - `scripts/server/check-env.sh [env] [example]`: lists the variables `.env` lacks. Exit 0 when complete, 1 when variables are missing, 2 when a file is absent. It writes nothing.
  - `scripts/server/dump.sh [label]`: writes an encrypted dump of the database to the backup volume (`/data/backups/pre-update/<UTC time>-<label>.dump.gpg`, the ten newest kept) and prints that path.
  - `scripts/server/update.sh vX.Y.Z`: the seven steps of PRD 12.5. Exit 0 on success, 1 when a step fails, 2 on a wrong argument.
  - `scripts/server/compose.sh <docker compose arguments>`: `docker compose` pinned to the deployed version.
  - `scripts/server/state/release` and `previous`: the version this stack runs and the one before, written by a successful update. They are not in git.
- How `APP_VERSION` moves without writing to `.env`: `update.sh` exports the new version for its own run, and records it in `state/release` once the stack is healthy. `.env` keeps the value it was installed with; `compose.sh` exports the recorded one. Plan 07's runbook tells the operator to use `compose.sh` on the server.

- [ ] **Step 1: Write the failing tests**

`scripts/server/tests/check-env.test.sh`:

```bash
#!/usr/bin/env bash
# Tests scripts/server/check-env.sh.   Run: bash scripts/server/tests/check-env.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/../check-env.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }

printf 'A=1\nB=2\n# C arrived in this version\nC=3\nD=4\n' > "$TMP/example"

# 1. A complete .env passes; a variable the example does not know is not a problem.
printf 'A=x\nB=y\nC=\nD=w\nEXTRA=1\n' > "$TMP/env"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "a complete .env passes" "$code" "0"
lacks "an extra variable is not reported" "$out" "EXTRA"

# 2. Missing variables are named, and nothing is written.
printf 'A=x\nB=y\n' > "$TMP/env"
before="$(cksum < "$TMP/env")"; listing="$(ls -A "$TMP")"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "an incomplete .env fails with exit code 1" "$code" "1"
contains "the first missing variable is named" "$out" "^  C$"
contains "the second missing variable is named" "$out" "^  D$"
lacks "a variable that is present is not named" "$out" "^  A$"
is "the .env is left byte for byte as it was" "$(cksum < "$TMP/env")" "$before"
is "no file is created beside it" "$(ls -A "$TMP")" "$listing"

# 3. A variable that is only commented out is missing.
printf 'A=x\nB=y\n# C=3\nD=w\n' > "$TMP/env"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "a commented-out variable counts as missing" "$code" "1"
contains "and is named" "$out" "^  C$"

# 4. A .env saved with Windows line endings is read all the same.
printf 'A=x\r\nB=y\r\nC=z\r\nD=w\r\n' > "$TMP/env"
bash "$CHECK" "$TMP/env" "$TMP/example" >/dev/null 2>&1; code=$?
is "Windows line endings are accepted" "$code" "0"

# 5. No .env at all.
out="$(bash "$CHECK" "$TMP/absent" "$TMP/example" 2>&1)"; code=$?
is "a missing .env fails with exit code 2" "$code" "2"
contains "and says what to do" "$out" "does not exist"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "check-env.test.sh: all passed"
```

`scripts/server/tests/update.test.sh`:

```bash
#!/usr/bin/env bash
# Tests scripts/server/update.sh with stand-ins for git, docker, curl and sleep.
# Run: bash scripts/server/tests/update.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE="$HERE/../update.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
line_of() { grep -n -m 1 -- "$1" "$BOX/calls.log" | cut -d: -f1; }
in_order() { # description, then patterns that must appear in calls.log in this order
  local description="$1" last=0 line; shift
  for pattern in "$@"; do
    line="$(line_of "$pattern")"
    if [ -z "$line" ] || [ "$line" -le "$last" ]; then fail "$description (at: $pattern)"; return; fi
    last="$line"
  done
  pass "$description"
}

stub() { # name, body lines...
  local name="$1"; shift
  { echo '#!/usr/bin/env bash'; printf '%s\n' "$@"; } > "$BOX/bin/$name"
  chmod +x "$BOX/bin/$name"
}

# A stack directory with a server .env, and stand-ins that record every call.
new_box() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/scripts/server/state"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'APP_VERSION=v1.0.0' \
    'SITE_HOSTNAME=hr.test.local' 'HTTPS_PORT=8443' 'POSTGRES_DB=iris_hr' > "$BOX/.env"
  cp "$BOX/.env" "$BOX/next.env.example"     # what "git show <version>:.env.example" prints
  : > "$BOX/calls.log"
  echo ok > "$BOX/health"
  stub git 'echo "git $*" >> "$IRIS_ROOT/calls.log"' 'case " $* " in *" show "*) cat "$IRIS_ROOT/next.env.example" ;; esac' 'exit 0'
  stub docker 'echo "docker[APP_VERSION=${APP_VERSION:-}] $*" >> "$IRIS_ROOT/calls.log"' 'exit 0'
  stub curl 'echo "curl $*" >> "$IRIS_ROOT/calls.log"' '[ "$(cat "$IRIS_ROOT/health")" = ok ]'
  stub sleep 'exit 0'
  ENV_SUM="$(cksum < "$BOX/.env")"
}
run_update() { IRIS_ROOT="$BOX" IRIS_HEALTH_TRIES=2 PATH="$BOX/bin:$PATH" bash "$UPDATE" "$@" 2>&1; }
calls() { cat "$BOX/calls.log"; }

# 1. A wrong argument changes nothing.
new_box
out="$(run_update)"; code=$?
is "no version: exit code 2" "$code" "2"
contains "no version: shows the usage" "$out" "Usage: scripts/server/update.sh vX.Y.Z"
out="$(run_update 1.2.0)"; code=$?
is "a version without the v: exit code 2" "$code" "2"
is "a wrong argument calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 2. It refuses to run on a development stack.
new_box
sed -i 's/compose.server.yaml/compose.dev.yaml/' "$BOX/.env"
out="$(run_update v1.2.0)"; code=$?
is "a development .env: exit code 1" "$code" "1"
contains "a development .env: says why" "$out" "not a server stack"
is "a development .env: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 3. A variable missing from .env stops the update before anything changes.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
echo 'NEW_VARIABLE=1' >> "$BOX/next.env.example"
out="$(run_update v1.2.0)"; code=$?
is "missing variable: exit code 1" "$code" "1"
contains "missing variable: it is named" "$out" "^  NEW_VARIABLE$"
contains "missing variable: says nothing was changed" "$out" "Nothing was changed"
lacks "missing variable: the version is not checked out" "$(calls)" "checkout"
lacks "missing variable: docker is not called" "$(calls)" "^docker"
is "missing variable: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
is "missing variable: the recorded version is unchanged" "$(cat "$BOX/scripts/server/state/release")" "v1.1.0"
rm -rf "$BOX"

# 4. A first installation: no dump, then pull, migrate, restart, health.
new_box
out="$(run_update v1.2.0)"; code=$?
is "first installation: exit code 0" "$code" "0"
in_order "first installation: the steps run in order" \
  "git .*fetch" "git .*show v1.2.0:.env.example" "git .*checkout .*v1.2.0" \
  "docker\[APP_VERSION=v1.2.0\] compose pull" "docker\[APP_VERSION=v1.2.0\] compose run .*migrate" \
  "docker\[APP_VERSION=v1.2.0\] compose up -d" "curl .*https://hr.test.local:8443/api/v1/health"
lacks "first installation: nothing is dumped" "$(calls)" "pg_dump"
contains "first installation: says so" "$out" "no database to dump"
is "first installation: the version is recorded" "$(cat "$BOX/scripts/server/state/release")" "v1.2.0"
is "first installation: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
contains "first installation: points to compose.sh" "$out" "scripts/server/compose.sh"
rm -rf "$BOX"

# 5. An update: the database is dumped with the running version, before the new images are pulled.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
out="$(run_update v1.2.0)"; code=$?
is "update: exit code 0" "$code" "0"
in_order "update: dump, then pull, migrate, restart, health" \
  "git .*checkout .*v1.2.0" "docker\[APP_VERSION=v1.1.0\] compose run .*app bash" "pg_dump" \
  "docker\[APP_VERSION=v1.2.0\] compose pull" "docker\[APP_VERSION=v1.2.0\] compose run .*migrate" \
  "docker\[APP_VERSION=v1.2.0\] compose up -d --no-build" "curl "
contains "update: the dump is encrypted" "$(calls)" "gpg .*--symmetric"
contains "update: says where the dump is" "$out" "/data/backups/pre-update/.*before-v1.2.0.dump.gpg"
is "update: the new version is recorded" "$(cat "$BOX/scripts/server/state/release")" "v1.2.0"
is "update: the one before is recorded" "$(cat "$BOX/scripts/server/state/previous")" "v1.1.0"
is "update: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
rm -rf "$BOX"

# 6. A version that does not become healthy: the way back is printed, nothing is recorded.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
echo down > "$BOX/health"
out="$(run_update v1.2.0)"; code=$?
is "unhealthy: exit code 1" "$code" "1"
contains "unhealthy: says so" "$out" "v1.2.0 did not become healthy"
contains "unhealthy: prints the command to return to the previous version" "$out" "scripts/server/update.sh v1.1.0"
contains "unhealthy: prints where the dump is" "$out" "/data/backups/pre-update/"
is "unhealthy: it tried as often as it was told" "$(grep -c '^curl ' "$BOX/calls.log")" "2"
is "unhealthy: the recorded version is unchanged" "$(cat "$BOX/scripts/server/state/release")" "v1.1.0"
rm -rf "$BOX"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "update.test.sh: all passed"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/server/tests/check-env.test.sh` and `bash scripts/server/tests/update.test.sh`
Expected: both print lines starting with `FAIL` (the scripts do not exist yet: `bash: …/check-env.sh: No such file or directory`) and end with `check(s) failed`.

- [ ] **Step 3: Write the shared helpers and the `.env` check**

`scripts/server/lib.sh`:

```bash
# shellcheck shell=bash
# Shared by the server scripts. Source it: it defines names and runs nothing.

# The stack directory, where .env and the compose files are. The tests point IRIS_ROOT elsewhere.
ROOT="${IRIS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
STATE="$ROOT/scripts/server/state"
ENV_FILE="$ROOT/.env"

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# The names of the variables a file defines, sorted, one per line.
env_keys() {
  sed -e 's/\r$//' "$1" | { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true; } | cut -d= -f1 | LC_ALL=C sort -u
}

# The value of one variable of the stack's .env, without surrounding quotes.
env_value() {
  local line
  line="$(sed -e 's/\r$//' "$ENV_FILE" | { grep -E "^$1=" || true; } | tail -n 1)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

# The version this stack runs: the one the last successful update recorded, else the one in .env.
deployed_version() {
  if [ -s "$STATE/release" ]; then cat "$STATE/release"; else env_value APP_VERSION; fi
}

# docker compose for this stack, at the deployed version unless the caller exported another one.
# A variable exported in the shell wins over the same variable in .env, which is how a version
# is changed without writing to .env.
compose() {
  (cd "$ROOT" && APP_VERSION="${APP_VERSION:-$(deployed_version)}" docker compose "$@")
}

require_server_stack() {
  [ -f "$ENV_FILE" ] || die "There is no .env in $ROOT. Run this in the stack directory on the server."
  case "$(env_value COMPOSE_FILE)" in
    *compose.server.yaml*) ;;
    *) die "COMPOSE_FILE in .env does not name compose.server.yaml: this is not a server stack." ;;
  esac
}
```

`scripts/server/check-env.sh`:

```bash
#!/usr/bin/env bash
# Compares a .env with a .env.example and lists the variables the .env lacks.
# It reads both files and writes nothing.
#
# Usage: scripts/server/check-env.sh [path/to/.env] [path/to/.env.example]
# Exit:  0 the .env is complete   1 variables are missing   2 a file is absent
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local env_file="${1:-$ENV_FILE}" example="${2:-$ROOT/.env.example}" missing name
  if [ ! -f "$env_file" ]; then
    log "ERROR: $env_file does not exist. Copy .env.example to .env and fill in every value."
    exit 2
  fi
  if [ ! -f "$example" ]; then
    log "ERROR: $example does not exist."
    exit 2
  fi
  # Lines that are in the example and not in the .env.
  missing="$(LC_ALL=C comm -13 <(env_keys "$env_file") <(env_keys "$example"))"
  if [ -n "$missing" ]; then
    log "The .env lacks variables that this version needs:"
    while IFS= read -r name; do log "  $name"; done <<<"$missing"
    log "See .env.example for what each one means, add them to $env_file, then run the command again."
    exit 1
  fi
  log "The .env is complete."
}

main "$@"
```

`scripts/server/state/.gitignore` (the folder is in the repository, what the scripts record in it is not):

```gitignore
*
!.gitignore
```

- [ ] **Step 4: Write the dump, the compose wrapper and the update**

`scripts/server/dump.sh`:

```bash
#!/usr/bin/env bash
# Writes an encrypted dump of the database to the backup volume and prints its path.
# The dump is made inside the backend image, which carries pg_dump and gpg, and encrypted
# with BACKUP_PASSPHRASE. The ten newest dumps of this kind are kept.
#
# Usage: scripts/server/dump.sh [label]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local label="${1:-manual}" name
  [[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || die "The label may hold letters, digits, dots, dashes and underscores only."
  require_server_stack
  name="$(date -u +%Y%m%dT%H%M%SZ)-$label.dump.gpg"
  # The script below runs in the container: its variables are the container's, hence the single quotes.
  # shellcheck disable=SC2016
  compose run --rm -T app bash -c '
    set -euo pipefail
    umask 077
    mkdir -p /data/backups/pre-update
    out="/data/backups/pre-update/$1"
    trap "rm -f \"$out.part\"" EXIT
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host db --username "$POSTGRES_USER" --format custom "$POSTGRES_DB" \
      | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out.part" 3<<<"$BACKUP_PASSPHRASE"
    mv "$out.part" "$out"
    ls -1t /data/backups/pre-update/*.dump.gpg | tail -n +11 | xargs -r rm -f --
  ' dump "$name" >&2
  printf '/data/backups/pre-update/%s\n' "$name"
}

main "$@"
```

`scripts/server/compose.sh`:

```bash
#!/usr/bin/env bash
# docker compose for this stack, pinned to the version the last update deployed.
# On the server, use it instead of plain "docker compose": a plain command would read
# APP_VERSION from .env, which an update never rewrites.
#
# Usage: scripts/server/compose.sh ps
#        scripts/server/compose.sh logs --tail 100 app
#        scripts/server/compose.sh exec app python manage.py create_sysadmin --email <address> --name <name>
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_server_stack
compose "$@"
```

`scripts/server/update.sh`:

```bash
#!/usr/bin/env bash
# Moves this stack to a version, in the seven steps of the specification:
#   1 fetch the version    2 check .env    3 dump the database    4 pull the images
#   5 apply migrations     6 restart       7 check /health
# It never writes to .env. If .env lacks a variable the version needs, it stops before changing anything.
#
# Usage: scripts/server/update.sh vX.Y.Z
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# /health answers 503 until the worker's first heartbeat, up to about 90 seconds after a restart:
# 36 tries, 5 seconds apart, give it three minutes.
HEALTH_TRIES="${IRIS_HEALTH_TRIES:-36}"

step() { log ""; log "[$1/7] $2"; }

wait_for_health() {
  local host port
  host="$(env_value SITE_HOSTNAME)"
  port="$(env_value HTTPS_PORT)"
  port="${port:-443}"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    # Asked through the proxy, as a browser would. --insecure because the certificate may come from
    # Caddy's own authority, which this machine need not trust to probe itself.
    if curl --fail --silent --insecure --max-time 5 --output /dev/null \
      --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/v1/health"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

fetch_and_check() {
  local version="$1" example
  step 1 "Fetching $version"
  git -C "$ROOT" fetch --tags --force --quiet origin
  git -C "$ROOT" rev-parse --quiet --verify "refs/tags/$version^{commit}" >/dev/null || die "There is no version $version."

  step 2 "Checking .env against the .env.example of $version"
  example="$(mktemp)"
  git -C "$ROOT" show "$version:.env.example" > "$example"
  if ! bash "$HERE/check-env.sh" "$ENV_FILE" "$example"; then
    rm -f "$example"
    die "Nothing was changed."
  fi
  rm -f "$example"

  # Only now do the compose files and scripts of the version replace the ones in place.
  git -C "$ROOT" checkout --quiet --detach "$version"
}

apply() {
  local version="$1" previous="" dump=""
  if [ -s "$STATE/release" ]; then previous="$(cat "$STATE/release")"; fi

  if [ -n "$previous" ]; then
    step 3 "Dumping the database, with the version in place ($previous)"
    dump="$(APP_VERSION="$previous" bash "$HERE/dump.sh" "before-$version")"
    log "Dump: $dump"
  else
    step 3 "First installation: there is no database to dump"
  fi

  # From here on every compose command uses the new version. This overrides APP_VERSION from .env
  # for this run only; .env itself is not touched.
  export APP_VERSION="$version"

  step 4 "Pulling the images of $version"
  compose pull --quiet

  step 5 "Applying database migrations"
  compose run --rm -T app python manage.py migrate --noinput

  step 6 "Restarting the containers"
  compose up -d --no-build --remove-orphans

  step 7 "Waiting for /health, up to $((HEALTH_TRIES * 5)) seconds"
  if wait_for_health; then
    mkdir -p "$STATE"
    printf '%s\n' "$previous" > "$STATE/previous"
    printf '%s\n' "$version" > "$STATE/release"
    log ""
    log "Update to $version complete."
    log "For any later command use scripts/server/compose.sh, which stays on $version."
    return 0
  fi

  log ""
  log "ERROR: $version did not become healthy."
  log "What it says:                 APP_VERSION=$version docker compose logs --tail 100 app worker proxy"
  if [ -n "$previous" ]; then
    log "Return to the previous one:   scripts/server/update.sh $previous"
    log "Database dump taken before:   $dump (in the backup volume)"
  fi
  exit 1
}

main() {
  local version="${1:-}"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log "Usage: scripts/server/update.sh vX.Y.Z"
    exit 2
  fi
  require_server_stack
  if [ "${IRIS_UPDATE_STAGE:-fetch}" = "fetch" ]; then
    fetch_and_check "$version"
    # The checkout may have replaced this very file: carry on with the script of the new version.
    IRIS_UPDATE_STAGE=apply exec bash "$HERE/update.sh" "$version"
  fi
  apply "$version"
}

main "$@"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash scripts/server/tests/check-env.test.sh`
Expected: thirteen lines starting with `ok`, then `check-env.test.sh: all passed`.

Run: `bash scripts/server/tests/update.test.sh`
Expected: thirty-four lines starting with `ok`, then `update.test.sh: all passed`.

- [ ] **Step 6: Mark the scripts as executable and check their line endings**

```bash
git add scripts/server
git update-index --chmod=+x scripts/server/check-env.sh scripts/server/dump.sh scripts/server/compose.sh scripts/server/update.sh scripts/server/tests/check-env.test.sh scripts/server/tests/update.test.sh
git ls-files --eol scripts/server
```

Expected: every line starts with `i/lf`. If one starts with `i/crlf`, run `git add --renormalize scripts/server` and look again: a script with Windows line endings fails on Ubuntu with `bad interpreter`.

- [ ] **Step 7: Commit**

```bash
git add scripts/server
git commit -m "feat(server): update command in seven steps, .env check that never writes, encrypted dump"
```

---

### Task 23: The pipeline

**Files:**
- Create: `.github/scripts/make-env.sh`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Test: `.github/scripts/make-env.test.sh`

**Interfaces:**
- Consumes: `.env.example` (four secrets hold the placeholder `change-me`; plan 01a's test suite needs `TIME_ZONE=Africa/Tunis` and `ALLOWED_EMAIL_DOMAIN=impactrisks.com`, which the example already has); `backend/tests/test_openapi.py`, which fails when `backend/openapi.yaml` is stale; the npm scripts of Task 1; the shell tests of Tasks 21 and 22; the Playwright suite of Task 24.
- Produces:
  - `.github/scripts/make-env.sh [example] [target]`: a throwaway `.env` for the pipeline, with generated secrets. It refuses to overwrite a file.
  - Workflow `CI` on every push and pull request, also callable by another workflow: backend (Ruff, tests against PostgreSQL, which include the OpenAPI check), frontend (API types current, ESLint, `tsc`, tests, build), server scripts (ShellCheck and the shell tests), dependency vulnerabilities (`pip-audit`, `npm audit`), images (backend build, proxy build and smoke test), browser journeys.
  - Workflow `Release` on a tag `vX.Y.Z`: the same checks, then `ghcr.io/<owner>/iris-hr-backend:<tag>` and `ghcr.io/<owner>/iris-hr-proxy:<tag>`. On the server, `IMAGE_PREFIX` is therefore `ghcr.io/<owner in lower case>/iris-hr`.

- [ ] **Step 1: Write the failing test**

`.github/scripts/make-env.test.sh`:

```bash
#!/usr/bin/env bash
# Tests .github/scripts/make-env.sh.   Run from the repository root: bash .github/scripts/make-env.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
value() { grep -E "^$1=" "$TMP/.env" | cut -d= -f2-; }

# 1. From the real example: every variable is there, no placeholder is left, the secrets have the right shape.
bash "$HERE/make-env.sh" "$ROOT/.env.example" "$TMP/.env" >/dev/null 2>&1; code=$?
is "creates the file" "$code" "0"
bash "$ROOT/scripts/server/check-env.sh" "$TMP/.env" "$ROOT/.env.example" >/dev/null 2>&1; code=$?
is "defines every variable of .env.example" "$code" "0"
if grep -q 'change-me' "$TMP/.env"; then fail "leaves no placeholder"; else pass "leaves no placeholder"; fi
if [ "$(value DJANGO_SECRET_KEY | wc -c)" -ge 51 ]; then pass "the Django secret has at least 50 characters"; else fail "the Django secret has at least 50 characters"; fi
if [[ "$(value FILE_ENCRYPTION_KEY)" =~ ^[A-Za-z0-9_-]{43}=$ ]]; then pass "the file key is a Fernet key"; else fail "the file key is a Fernet key"; fi
if [ "$(value POSTGRES_PASSWORD | wc -c)" -ge 13 ]; then pass "the database password has at least 12 characters"; else fail "the database password has at least 12 characters"; fi
if [ "$(value BACKUP_PASSPHRASE | wc -c)" -ge 17 ]; then pass "the backup passphrase has at least 16 characters"; else fail "the backup passphrase has at least 16 characters"; fi
is "keeps the time zone the tests rely on" "$(value TIME_ZONE)" "Africa/Tunis"
is "keeps the email domain the tests rely on" "$(value ALLOWED_EMAIL_DOMAIN)" "impactrisks.com"
is "loads the development stack" "$(value COMPOSE_FILE)" "compose.yaml:compose.dev.yaml"

# 2. It never overwrites a .env.
before="$(cksum < "$TMP/.env")"
bash "$HERE/make-env.sh" "$ROOT/.env.example" "$TMP/.env" >/dev/null 2>&1; code=$?
is "refuses to overwrite an existing file" "$code" "1"
is "and leaves it as it was" "$(cksum < "$TMP/.env")" "$before"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "make-env.test.sh: all passed"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash .github/scripts/make-env.test.sh`
Expected: lines starting with `FAIL` (`make-env.sh: No such file or directory`), then `check(s) failed`.

- [ ] **Step 3: Write `make-env.sh`**

`.github/scripts/make-env.sh`:

```bash
#!/usr/bin/env bash
# Creates a throwaway .env for the pipeline from .env.example, with generated secrets.
# It never overwrites a file. A developer machine uses scripts/dev.ps1 init instead.
#
# Usage: bash .github/scripts/make-env.sh [path/to/.env.example] [path/to/.env]
set -euo pipefail

example="${1:-.env.example}"
target="${2:-.env}"

if [ ! -f "$example" ]; then
  echo "ERROR: $example does not exist." >&2
  exit 2
fi
if [ -e "$target" ]; then
  echo "ERROR: $target already exists and is never overwritten." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }
# 32 random bytes as URL-safe base64 with its padding: the format of a Fernet key.
fernet() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'; }

sed -e 's/\r$//' \
  -e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(hex 32)|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(hex 24)|" \
  -e "s|^FILE_ENCRYPTION_KEY=.*|FILE_ENCRYPTION_KEY=$(fernet)|" \
  -e "s|^BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$(hex 24)|" \
  "$example" > "$target"

echo "Created $target with generated secrets."
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash .github/scripts/make-env.test.sh`
Expected: twelve lines starting with `ok`, then `make-env.test.sh: all passed`.

- [ ] **Step 5: Write the two workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI

# On every push and pull request (PRD 12.4), and when the release workflow calls it.
on:
  push:
    branches: ["**"]
  pull_request:
  workflow_call:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  backend:
    name: Backend (Ruff, tests against PostgreSQL, OpenAPI)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Create a throwaway .env
        run: bash .github/scripts/make-env.sh
      - name: Build the development image
        run: docker compose build app
      - name: Ruff, lint and format
        run: |
          docker compose run --rm app ruff check .
          docker compose run --rm app ruff format --check .
      - name: Tests (they include the check that backend/openapi.yaml is current)
        run: docker compose run --rm app pytest -q

  frontend:
    name: Frontend (API types, ESLint, tsc, tests, build)
    runs-on: ubuntu-24.04
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - name: The generated API types are current
        run: |
          npm run api:types
          git diff --exit-code -- src/api/schema.d.ts
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  scripts:
    name: Server scripts (ShellCheck, tests, line endings)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: ShellCheck
        run: shellcheck --severity=warning scripts/server/*.sh scripts/server/tests/*.sh proxy/entrypoint.sh proxy/tests/smoke.sh .github/scripts/*.sh
      - run: bash scripts/server/tests/check-env.test.sh
      - run: bash scripts/server/tests/update.test.sh
      - run: bash .github/scripts/make-env.test.sh
      - name: Every script is stored with LF line endings
        run: |
          if git ls-files --eol scripts proxy .github | grep -E '^i/(crlf|mixed)'; then
            echo "The files above are stored with Windows line endings. Run: git add --renormalize ."
            exit 1
          fi

  audit:
    name: Dependency vulnerabilities
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Python dependencies (pip-audit over the locked versions)
        run: |
          uv export --project backend --frozen --no-dev --no-emit-project --format requirements-txt --output-file /tmp/requirements.txt
          uvx pip-audit --requirement /tmp/requirements.txt --disable-pip
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: JavaScript dependencies (npm audit over the lock file)
        working-directory: frontend
        run: npm audit --audit-level=high

  images:
    name: Images (backend build, proxy build and smoke test)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Backend image, production stage
        run: docker build --tag iris-hr-backend:ci backend
      - name: Proxy image and its smoke test
        run: bash proxy/tests/smoke.sh

  e2e:
    name: Browser journeys
    runs-on: ubuntu-24.04
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - name: Create a throwaway .env
        run: bash .github/scripts/make-env.sh
      - name: Start the development stack
        run: |
          docker compose build
          docker compose run --rm app python manage.py migrate --noinput
          docker compose up -d
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install Playwright and its browser
        working-directory: frontend
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Wait for the application
        run: |
          for _ in $(seq 1 120); do
            if curl --fail --silent --output /dev/null http://localhost:5173/login; then exit 0; fi
            sleep 2
          done
          docker compose logs web app
          exit 1
      - name: Journeys
        working-directory: frontend
        run: npx playwright test
      - name: Keep the report and the logs of a failed run
        if: failure()
        run: docker compose logs > frontend/playwright-report/stack.log 2>&1 || true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report
          retention-days: 7
```

`.github/workflows/release.yml`:

```yaml
name: Release

# On a version tag vX.Y.Z: the same checks, then the two images in GitHub's container registry (PRD 12.4).
on:
  push:
    tags: ["v[0-9]+.[0-9]+.[0-9]+"]

permissions:
  contents: read
  packages: write

jobs:
  checks:
    uses: ./.github/workflows/ci.yml

  publish:
    name: Publish the backend and proxy images
    needs: checks
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Image names
        id: names
        # The registry wants lower case. The server's IMAGE_PREFIX is this value.
        run: echo "prefix=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/iris-hr" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Backend image (the last stage of backend/Dockerfile, with Gunicorn)
        uses: docker/build-push-action@v6
        with:
          context: backend
          push: true
          tags: ${{ steps.names.outputs.prefix }}-backend:${{ github.ref_name }}
      - name: Proxy image (Caddy with the built application)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: proxy/Dockerfile
          push: true
          tags: ${{ steps.names.outputs.prefix }}-proxy:${{ github.ref_name }}
```

- [ ] **Step 6: Check the workflows before pushing them**

```bash
git add .github
git update-index --chmod=+x .github/scripts/make-env.sh .github/scripts/make-env.test.sh
docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:latest -color
```

In PowerShell write `${PWD}` instead of `$(pwd)`.
Expected: no output and exit code 0. A message names the file, the line and what is wrong (an unknown key, a bad expression); correct it and run again.

- [ ] **Step 7: Commit**

```bash
git add .github
git commit -m "ci: checks on every push, images on a version tag"
```

Nothing is pushed yet: the `Browser journeys` job needs the specs of Task 24, and the first push happens at the end of that task.

---

### Task 24: Browser journeys

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/global-setup.ts`, `frontend/e2e/helpers.ts`
- Test: `frontend/e2e/sign-in.spec.ts`, `frontend/e2e/create-account.spec.ts`, `frontend/e2e/first-sign-in.spec.ts`, `frontend/e2e/check-system.spec.ts`

**Interfaces:**
- Consumes: the running development stack (`docker compose up -d`, application at `http://localhost:5173`); `python manage.py e2e_reset` and the demo accounts of plan 01a (`sysadmin@impactrisks.com` is "Sonia Admin", every password is `Correct-Horse-42!`); every page of Tasks 10 to 20.
- Produces:
  - `npx playwright test` (run from `frontend/`): two projects, `desktop` (Chromium) and `phone` (a Pixel 7 viewport), one worker, the database reset once before the suite. **It empties the development database.**
  - `e2e/helpers.ts`: `PASSWORD`, `SYSADMIN`, `signIn(page, email, password?, lang?)`, `signOut(page, name, lang?)`, `uniqueEmail(testInfo, prefix)`, `createAdministrator(page, name, email): Promise<string>` (returns the temporary password). Later plans add one spec file per journey of UI section 12 and reuse these.
- These specs are written after the pages they exercise: they are the acceptance of Tasks 10 to 20 and are expected to pass at once. Step 3 shows that they can fail.

- [ ] **Step 1: Write the configuration, the set-up and the helpers**

`frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

// The journeys run against the development stack (docker compose up -d) and share one database,
// so they run one after the other.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
```

`frontend/e2e/global-setup.ts`:

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Empties the development database and loads the demo accounts, once before the suite. */
export default function globalSetup(): void {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  execFileSync("docker", ["compose", "exec", "-T", "app", "python", "manage.py", "e2e_reset"], { cwd: root, stdio: "inherit" });
}
```

`frontend/e2e/helpers.ts`:

```ts
import { expect, type Page, type TestInfo } from "@playwright/test";

export const PASSWORD = "Correct-Horse-42!";
export const SYSADMIN = { email: "sysadmin@impactrisks.com", name: "Sonia Admin" };

const TEXT = {
  fr: {
    language: "Français",
    email: "Adresse e-mail professionnelle",
    password: "Mot de passe",
    submit: "Se connecter",
    title: "Connexion",
    signOut: "Se déconnecter",
    menu: (name: string) => `Menu de ${name}`,
  },
  en: {
    language: "English",
    email: "Professional email",
    password: "Password",
    submit: "Sign in",
    title: "Sign in",
    signOut: "Sign out",
    menu: (name: string) => `Menu of ${name}`,
  },
} as const;

export type Lang = keyof typeof TEXT;

/** Fills the sign-in form that is on screen, in the given language. */
export async function fillSignIn(page: Page, email: string, password: string = PASSWORD, lang: Lang = "fr"): Promise<void> {
  await page.getByRole("button", { name: TEXT[lang].language, exact: true }).click();
  await page.getByLabel(TEXT[lang].email, { exact: true }).fill(email);
  await page.getByLabel(TEXT[lang].password, { exact: true }).fill(password);
  await page.getByRole("button", { name: TEXT[lang].submit, exact: true }).click();
}

export async function signIn(page: Page, email: string, password: string = PASSWORD, lang: Lang = "fr"): Promise<void> {
  await page.goto("/login");
  await fillSignIn(page, email, password, lang);
}

export async function signOut(page: Page, name: string, lang: Lang = "fr"): Promise<void> {
  await page.getByRole("button", { name: TEXT[lang].menu(name), exact: true }).click();
  await page.getByRole("menuitem", { name: TEXT[lang].signOut, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: TEXT[lang].title, exact: true })).toBeVisible();
}

/** An address no other run has used: the two projects share one database. */
export function uniqueEmail(testInfo: TestInfo, prefix: string): string {
  return `${prefix}.${testInfo.project.name}.${Date.now().toString(36)}@impactrisks.com`;
}

/** As the signed-in administrator, in French: creates an administrator account and returns its temporary password. */
export async function createAdministrator(page: Page, name: string, email: string): Promise<string> {
  await page.getByRole("link", { name: "Comptes", exact: true }).click();
  await page.getByRole("link", { name: "Créer un compte", exact: true }).first().click();
  await page.getByLabel("Nom", { exact: true }).fill(name);
  await page.getByLabel("Adresse e-mail professionnelle", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: "Administrateur système" }).check();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
  await expect(result).toBeVisible();
  const password = (await result.locator("p").first().innerText()).trim();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  return password;
}
```

- [ ] **Step 2: Write the four journeys**

`frontend/e2e/sign-in.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { fillSignIn, PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";

test("signs in in French, then in English", async ({ page }) => {
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Comptes", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await signOut(page, SYSADMIN.name, "fr");

  await signIn(page, SYSADMIN.email, PASSWORD, "en");
  await expect(page.getByRole("heading", { level: 1, name: "Status", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await signOut(page, SYSADMIN.name, "en");
});

test("refuses a wrong password with one message and keeps the email", async ({ page }) => {
  await signIn(page, SYSADMIN.email, "not-the-password-1", "fr");
  await expect(page.getByRole("alert")).toContainText(/\S/);
  await expect(page.getByLabel("Adresse e-mail professionnelle", { exact: true })).toHaveValue(SYSADMIN.email);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("returns to the page that was asked for, with its filters", async ({ page }) => {
  await page.goto("/admin/accounts?state=locked");
  await expect(page).toHaveURL(/\/login\?next=/);
  await fillSignIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page).toHaveURL(/\/admin\/accounts\?state=locked$/);
  await expect(page.getByRole("heading", { level: 1, name: "Comptes", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "État" })).toHaveValue("locked");
});
```

`frontend/e2e/create-account.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createAdministrator, PASSWORD, signIn, SYSADMIN, uniqueEmail } from "./helpers";

test("the administrator creates an account and hands over a temporary password", async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo, "karim");
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();

  const temporary = await createAdministrator(page, "Karim Essai", email);
  expect(temporary.length).toBeGreaterThanOrEqual(12);

  // Back on the list: the account waits for its first sign-in, and the password is nowhere to be found.
  await expect(page).toHaveURL(/\/admin\/accounts/);
  await page.getByRole("searchbox", { name: "Nom ou adresse e-mail" }).fill(email);
  await expect(page.getByText("En attente de première connexion")).toBeVisible();
  await expect(page.getByText(temporary)).toHaveCount(0);
  await page.goBack();
  await expect(page.getByText(temporary)).toHaveCount(0);

  // The same address a second time is refused next to the field, and what was typed stays.
  await page.goto("/admin/accounts/new");
  await page.getByLabel("Nom", { exact: true }).fill("Karim Essai");
  await page.getByLabel("Adresse e-mail professionnelle", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await expect(page.getByLabel("Adresse e-mail professionnelle", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Karim Essai");
});
```

`frontend/e2e/first-sign-in.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createAdministrator, PASSWORD, signIn, signOut, SYSADMIN, uniqueEmail } from "./helpers";

const OWN_PASSWORD = "Nouveau-Cheval-2026!";

test("a first sign-in with a temporary password obliges to choose a new one", async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo, "leila");
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  const temporary = await createAdministrator(page, "Leila Essai", email);
  await signOut(page, SYSADMIN.name, "fr");

  await signIn(page, email, temporary, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/password\/new$/);

  // Nothing else is reachable until it is done.
  await page.goto("/admin/accounts");
  await expect(page).toHaveURL(/\/password\/new$/);

  // After the reload the temporary password is no longer in memory, so the page asks for it.
  await page.getByLabel("Mot de passe temporaire", { exact: true }).fill(temporary);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
  await page.getByLabel("Confirmez le nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
  await page.getByRole("button", { name: "Enregistrer le mot de passe", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page.getByText("Votre mot de passe a été modifié.")).toBeVisible();
  await signOut(page, "Leila Essai", "fr");

  // The temporary password no longer works; the chosen one does.
  await signIn(page, email, temporary, "fr");
  await expect(page.getByRole("alert")).toBeVisible();
  await signIn(page, email, OWN_PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
});
```

`frontend/e2e/check-system.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, SYSADMIN } from "./helpers";

test("the administrator checks the system", async ({ page }) => {
  // The reset just before the suite removed the worker's heartbeat; it returns within a minute.
  test.setTimeout(240_000);
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();

  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Tout fonctionne.")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 180_000 });
  await expect(page.getByText("Signal de vie du service de tâches")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);

  await page.getByRole("link", { name: "Journal de sécurité", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Journal de sécurité", exact: true })).toBeVisible();
  // The event is in a table cell on a desktop and in a card on a phone; the filter above also lists the word.
  await expect(page.locator("main").locator("td, dd").getByText("Connexion", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(page.getByText("Limite d'inactivité (minutes)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer les modifications" })).toHaveCount(0);
});
```

- [ ] **Step 3: Show that a journey can fail**

Install the browser once, on the host (not in the container):

```
cd frontend
npm ci
npx playwright install chromium
```

Stop the API and run one journey:

```
docker compose stop app
npx playwright test sign-in --project=desktop
```

Expected: FAIL. The set-up reports `service "app" is not running` and no test passes. Start it again: `docker compose start app`.

- [ ] **Step 4: Run the journeys**

Run, from `frontend/`: `npx playwright test`
Expected: the set-up prints `Database reset.`, then `12 passed` (six tests in each of the two projects). `check-system` can take up to two minutes while it waits for the worker's first heartbeat.

If a test fails on a label, open the report with `npx playwright show-report`: it shows the page at the moment of the failure. A label in these specs that differs from the page means a text was changed in a translation file after its test was written; correct the spec, not the page.

- [ ] **Step 5: Commit, push and watch the first run of the pipeline**

```bash
git add frontend/playwright.config.ts frontend/e2e
git commit -m "test(e2e): sign-in, account creation, first sign-in and system check, on desktop and phone"
```

The remote `origin` already exists: the private repository `https://github.com/Aymen53M/IRIS-HR`, which the project owner created and to which every commit is pushed (master section 13.6). Do not create a repository.

```bash
git push origin main
gh run watch
```

Expected: the `CI` workflow runs its six jobs (backend, frontend, server scripts, dependency vulnerabilities, images, browser journeys) and all of them end green. `gh run view --log-failed` shows what a red job said.

---

### Task 25: The developer guide

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `scripts/dev.ps1` (plan 01a) and everything this plan added.
- Produces: `README.md`, the one page a developer reads first: first run, the daily update, tests, API types, how a version reaches the server. The installation, update and restore runbook for the server is written in plan 07; this page says only what a developer needs to know about it.

- [ ] **Step 1: Write `README.md`**

````markdown
# IRIS HR

The internal HR platform of IRIS (Impact Risks & Insurance Solutions): leave and absence requests, approvals, balances, and the monthly figures for payroll.

- What it must do: `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md`
- What it looks like, page by page: `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md`
- How it is built, step by step: `docs/superpowers/plans/` (start with the master plan)

## What runs where

| Where | What |
|---|---|
| This machine (Windows 11, Docker Desktop) | The development stack: database, API, worker and the Vite server, with live reload |
| GitHub (private repository) | The code, the pipeline, the two images of each version. Never data, never secrets |
| The office server (Ubuntu, Docker) | The test stack, and the production stack at go-live. Each has its own `.env`, database and port |

## First run

You need Git, Docker Desktop and Node 24.

```powershell
git clone <repository address> iris-hr
cd iris-hr
powershell -File scripts/dev.ps1 init      # creates .env with generated secrets, builds, migrates
docker compose up -d
docker compose exec app python manage.py seed_demo
```

Open http://localhost:5173 and sign in as `sysadmin@impactrisks.com` with `Correct-Horse-42!`. The other demo accounts use the same password: `ceo@`, `hr@`, `manager.a@`, `employee.a1@`, `employee.a2@`, `manager.b@`, `employee.b1@`, all at `impactrisks.com`.

If the folder is synced by OneDrive and git or Docker reports a locked or missing file, pause the synchronisation and retry.

## Every day

```powershell
powershell -File scripts/dev.ps1 update    # git pull, checks .env, rebuilds, migrates, restarts
```

The script never writes to your `.env`. When a version adds a variable to `.env.example`, it stops and names it: add it to `.env` by hand, then run the command again.

| To do this | Run this |
|---|---|
| Start or stop the stack | `docker compose up -d`, `docker compose down` |
| See what the API says | `docker compose logs -f app` |
| Start again from an empty database | `powershell -File scripts/dev.ps1 reset -Yes` |
| Regenerate the API description and its TypeScript types | `powershell -File scripts/dev.ps1 openapi` |

## Tests

| What | Command |
|---|---|
| Backend | `docker compose run --rm app pytest -q` |
| Backend, one test | `docker compose run --rm app pytest apps/accounts/tests/test_auth.py::test_name -v` |
| Backend lint | `docker compose run --rm app ruff check .` and `docker compose run --rm app ruff format --check .` |
| Frontend | `docker compose run --rm web npm test` |
| Frontend, one file | `docker compose run --rm web npx vitest run src/features/accounts` |
| Frontend lint and types | `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck` |
| Server scripts | `bash scripts/server/tests/check-env.test.sh` and `bash scripts/server/tests/update.test.sh` |
| Proxy image | `bash proxy/tests/smoke.sh` |
| Browser journeys | `cd frontend; npx playwright test` |

The browser journeys run on this machine, not in a container, against the running stack. Install them once with `cd frontend; npm ci; npx playwright install chromium`. **They empty the development database** before they start, then load the demo accounts.

Frontend tests run in French, so they look for French labels. A missing translation key fails the test that meets it, and `src/i18n/parity.test.ts` fails when French and English do not have the same keys.

## When the API changes

The frontend never writes an API type by hand. After changing a serializer or a view:

```powershell
powershell -File scripts/dev.ps1 openapi
```

This rewrites `backend/openapi.yaml` and `frontend/src/api/schema.d.ts`. Commit both. The pipeline fails when either is stale.

## Adding a page

1. Write the page in `frontend/src/features/<feature>/` with its test next to it.
2. Put its texts in `frontend/src/i18n/locales/fr/<feature>.json` and `en/<feature>.json`.
3. Append its route to `frontend/src/workspaces/<workspace>/routes.tsx` (or to `frontend/src/app/sharedRoutes.tsx` for a page that belongs to no workspace).

The navigation entry of the workspace appears by itself once a route has its path. Nothing in `frontend/src/app/workspaces.ts` or `router.tsx` needs to change.

## From a commit to the server

1. Every push runs the checks: Ruff, ESLint, `tsc`, backend tests against PostgreSQL, frontend tests, the API description, dependency vulnerabilities, both image builds and the browser journeys.
2. A version is a tag: `git tag v1.2.0; git push origin v1.2.0`. The same checks run, then GitHub publishes `ghcr.io/<owner>/iris-hr-backend:v1.2.0` and `ghcr.io/<owner>/iris-hr-proxy:v1.2.0`.
3. On the server, in the directory of the stack to update:

   ```bash
   scripts/server/update.sh v1.2.0
   ```

   It fetches the version, checks `.env` against that version's `.env.example` (and stops, having changed nothing, if a variable is missing), dumps the database, pulls the two images, applies the migrations, restarts the containers and waits for `/api/v1/health`. If the version does not become healthy it prints the command that returns to the previous one and where the dump is.

Three things to know about the server:

- `update.sh` never writes to `.env`. The version in use is recorded in `scripts/server/state/release`, so on the server use `scripts/server/compose.sh` wherever you would type `docker compose`: it stays on the deployed version.
- In a server `.env`: `COMPOSE_FILE=compose.yaml:compose.server.yaml`, `IMAGE_PREFIX=ghcr.io/<owner in lower case>/iris-hr`, `SITE_HOSTNAME` is the name people type, and `DJANGO_ALLOWED_HOSTS` contains that same name. The test stack and the production stack differ by `ENVIRONMENT`, `SITE_HOSTNAME`, `HTTPS_PORT` and `HTTP_PORT`.
- HTTPS uses Caddy's own certificate authority unless `proxy/certs/site.crt` and `proxy/certs/site.key` exist in the stack directory.

The full installation, update and restore runbook is `docs/runbook.md` (written in the last build step).
````

- [ ] **Step 2: Check that every command the page names exists**

Run:

```bash
for path in scripts/dev.ps1 scripts/server/update.sh scripts/server/compose.sh scripts/server/tests/check-env.test.sh scripts/server/tests/update.test.sh proxy/tests/smoke.sh frontend/src/app/sharedRoutes.tsx frontend/src/app/workspaces.ts frontend/src/i18n/parity.test.ts backend/openapi.yaml frontend/src/api/schema.d.ts; do
  [ -e "$path" ] || echo "MISSING $path"
done
grep -c "" README.md
```

Expected: no line starting with `MISSING`, then the number of lines of the page.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: developer guide for the first run, daily work, tests and releases"
git push
```

---

### Task 26: The first version on the test stack

This task is the "done when" of build step 1: a user signs in on the test stack in both languages and every action is audited. It needs the office server of PRD open item 7 (an Ubuntu machine with Docker, Git and curl, an internal host name that resolves to it). Until that machine exists, Steps 2 to 8 can be rehearsed on any Ubuntu machine or virtual machine on the office network. It publishes images and installs software on a shared machine, so each step is done with the project owner's agreement.

**Files:**
- Create: `CHANGELOG.md`

**Interfaces:**
- Consumes: the `Release` workflow (Task 23), `scripts/server/update.sh` and `compose.sh` (Task 22), `compose.server.yaml` and the proxy (Task 21), `python manage.py create_sysadmin --email --name` (plan 01a), every page of this plan.
- Produces: version `v0.1.0` in the registry and running as the test stack; `CHANGELOG.md` with its first entry. Plan 07 turns Steps 2 to 6 into the installation chapter of the runbook.

- [ ] **Step 1: Write the changelog and tag the version**

`CHANGELOG.md`:

```markdown
# Changelog

Versions follow semantic versioning. Each version is a tag `vX.Y.Z`; its two images are published under the same tag.

## v0.1.0

Build step 1, Foundation.

- Sign-in with the professional email, lock-out, temporary passwords, forced change at first sign-in.
- Roles and the five workspaces; Administration with status, accounts, parameters and the security log.
- In-app notifications; French and English throughout.
- Audit trail of every sign-in, account, role and parameter change.
- Development stack in Docker, pipeline on every push, server update in one command.
```

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for v0.1.0"
git push
git tag v0.1.0
git push origin v0.1.0
gh run watch
```

Expected: the `Release` workflow runs the checks, then `Publish the backend and proxy images` ends green. `gh api "/users/<owner>/packages?package_type=container" --jq ".[].name"` (use `/orgs/<owner>/…` for an organisation) lists `iris-hr-backend` and `iris-hr-proxy`.

- [ ] **Step 2: Prepare the server account**

On the server, as the account that will run the stack (a member of the `docker` group, not `root`):

```bash
docker --version && docker compose version && git --version && curl --version | head -n 1
```

Expected: four version lines. Then give that account read-only access to the repository and the registry, with a GitHub token that has only "Contents: read" on this repository and "Packages: read":

```bash
git config --global credential.helper store
git clone https://github.com/Aymen53M/IRIS-HR.git /opt/iris-hr/test      # asks for the GitHub user and the token, once
docker login ghcr.io --username <github user>                            # asks for the same token
chmod 600 ~/.git-credentials ~/.docker/config.json
```

Expected: the clone ends with `Resolving deltas: 100%`, the login with `Login Succeeded`.

- [ ] **Step 3: Write the stack's `.env`**

```bash
cd /opt/iris-hr/test
cp .env.example .env
chmod 600 .env
openssl rand -hex 32                           # for DJANGO_SECRET_KEY
openssl rand -hex 24                           # for POSTGRES_PASSWORD
openssl rand -hex 24                           # for BACKUP_PASSPHRASE
openssl rand -base64 32 | tr '+/' '-_'         # for FILE_ENCRYPTION_KEY
```

Edit `.env` and set these values; leave the others as the example has them:

| Variable | Value for the test stack |
|---|---|
| `COMPOSE_FILE` | `compose.yaml:compose.server.yaml` |
| `ENVIRONMENT` | `test` |
| `APP_VERSION` | `v0.1.0` |
| `IMAGE_PREFIX` | `ghcr.io/<owner in lower case>/iris-hr` |
| `SITE_HOSTNAME` | the internal name of the test stack, for example `hr-test.impactrisks.lan` |
| `HTTPS_PORT`, `HTTP_PORT` | `8443`, `8080` (production will take 443 and 80) |
| `DJANGO_ALLOWED_HOSTS` | the same name as `SITE_HOSTNAME` |
| `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `BACKUP_PASSPHRASE`, `FILE_ENCRYPTION_KEY` | the four values generated above |

Run: `scripts/server/check-env.sh`
Expected: `The .env is complete.` Keep a copy of this `.env` somewhere other than this server: without `FILE_ENCRYPTION_KEY`, medical attachments cannot be read after a restore.

- [ ] **Step 4: Install the version**

```bash
sha256sum .env > /tmp/env.before
scripts/server/update.sh v0.1.0
sha256sum --check /tmp/env.before
```

Expected: the seven steps, each with its heading (`[1/7] Fetching v0.1.0` … `[7/7] Waiting for /health, up to 180 seconds`), with `First installation: there is no database to dump` at step 3, then `Update to v0.1.0 complete.` The last command prints `.env: OK`: the update did not touch it.

If step 7 fails, the script prints the command that shows the logs. The two usual causes on a first installation: `DJANGO_ALLOWED_HOSTS` does not contain `SITE_HOSTNAME` (the API answers 400), or the registry refuses the pull (`denied`: the token lacks "Packages: read", or `IMAGE_PREFIX` has an upper-case letter).

- [ ] **Step 5: Run the update a second time, to see the dump**

```bash
scripts/server/update.sh v0.1.0
scripts/server/compose.sh ps
```

Expected: step 3 now says `Dumping the database, with the version in place (v0.1.0)` and prints `Dump: /data/backups/pre-update/…-before-v0.1.0.dump.gpg`; the update ends as before. `compose.sh ps` lists `app`, `db`, `proxy` and `worker` as running, and only `proxy` shows published ports (8443 and 8080).

- [ ] **Step 6: Create the first System Administrator**

```bash
scripts/server/compose.sh exec app python manage.py create_sysadmin --email <first.last>@impactrisks.com --name "<First Last>"
```

Expected: a line `Temporary password: …`. It is shown once and expires after 24 hours; hand it over in person.

- [ ] **Step 7: Let office machines trust the certificate**

Without a company certificate in `proxy/certs/`, the stack uses Caddy's own authority. Export its root certificate and install it on the machines that will use the test stack (on Windows: "Trusted Root Certification Authorities"):

```bash
scripts/server/compose.sh exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > iris-hr-test-root.crt
```

Expected: a file that starts with `-----BEGIN CERTIFICATE-----`.

- [ ] **Step 8: Sign in from an office machine, in both languages, and read the audit trail**

From a machine on the office network, open `https://<SITE_HOSTNAME>:8443`.

1. The Sign in page appears with the strip "Environnement de test. Ceci n'est pas la production." Opening `http://<SITE_HOSTNAME>:8080` leads to the same page over HTTPS.
2. Choose "Français", sign in with the temporary password: "Choisissez un nouveau mot de passe" appears and nothing else can be opened. Choose a password.
3. Administration opens on "État": "Tout fonctionne." (within two minutes of the installation), four navigation entries, the version `v0.1.0` and the environment "test".
4. In the menu at the bottom of the sidebar choose "English": every label changes at once. Sign out, sign in again: the page is still in English.
5. Open "Security log": it lists, newest first, your sign-ins, "Signed out", "Password changed" and "Account created", each with your network address. Change the inactivity limit in "Parameters" and come back: "Parameter changed" is there, and opening it shows the value before and after.
6. On a phone on the office Wi-Fi, the same address shows the top bar, the tab bar and the same four entries.

Expected: all six observations hold. Build step 1 is done.

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| ACC-01 only company addresses (the refusal is shown next to the email) | 10, 17 |
| ACC-03 lock-out and limit per address (the messages) | 10 |
| ACC-04 session end, return to Sign in then to the page | 9, 15, 24 |
| ACC-05 account creation, temporary password shown once, forced change | 11, 17, 24, 26 |
| ACC-06 reset by the administrator | 19 |
| ACC-07 previous sign-in and reset notice | 11, 14 |
| ACC-08 own password change | 11 |
| ACC-09 roles given and removed, HR and System Administrator never together | 17, 19 |
| ACC-11 French or English, stored on the account | 3, 10, 13 |
| NOT-01 list, unread count, mark as read, mark all as read | 12 |
| NOT-03 a notification links to its item | 12 |
| NOT-04 texts in the reader's language (read again when the language changes) | 12, 13 |
| ADM-06 system settings | 20 |
| ADM-07 accounts and roles | 16, 17, 19 |
| AUD-06 security log, filterable, exportable | 18 |
| PRD 5.7 one workspace per role, never merged | 8, 13, 14, 15 |
| PRD 9.4 React, generated client, TanStack Query, React Router, schema-validated forms, translation files, routes by workspace, responsive | 1, 2, 3, 7, 8, 14, 15 |
| PRD 10 transport (HTTPS, HSTS) and web (CSRF header, content-security policy, clickjacking) | 2, 21 |
| PRD 10 network: nothing fetched from outside at run time (fonts bundled, no external origin) | 1, 21 |
| NFR-06 French and English throughout | 3 and every page task |
| NFR-07 desktop and phone (Chromium in the journeys; other browsers in plan 07) | 14, 24 |
| NFR-08 keyboard and screen reader (labelled controls, roles, focus, lint) | 1, 4 to 7, 13, 14 |
| PRD 12.2 containers and compose files (`web`, `proxy`, `compose.server.yaml`) | 1, 21 |
| PRD 12.3 environment files: never written by an update, checked first | 22, 23, 26 |
| PRD 12.4 pipeline on push and on a version tag | 23 |
| PRD 12.5 server update in seven steps | 22, 26 |
| PRD 12.8 browser tests (the journeys of this step) | 24 |
| PRD 12.10 changelog; developer guide | 25, 26 |
| UI 2.1 U3, U5, U6, U7, U8, U9 | 3 (U9), 7 (U5, U6), 5 (U7), 14 (U8); applied by every page task |
| UI 2.2 M1 to M8 | 4 (M1), 8 (M2), 16 (M3), 6 (M4, M5), 5 and 19 (M6), 6, 13 and 19 (M8) |
| UI 2.3 R1, R2, R4 | 8, 13, 15 |
| UI 3.1 the five workspaces and their navigation | 3, 8 |
| UI 3.2 switcher, counts, landing rule, links switch workspace | 8, 13, 14, 15 |
| UI 3.3 present on every page | 12, 13, 14 |
| UI 3.4 lists, empty lists, forms, mandatory confirmation, not allowed, session end, dates | 3, 6, 7, 9, 15 |
| UI 4.1 Sign in and its messages | 10 |
| UI 4.2 Choose a new password | 11 |
| UI 4.3 After sign-in | 11, 14 |
| UI 4.4 Change password | 11 |
| UI 9.1 Status | 16 |
| UI 9.2 Accounts, 9.3 Create account | 17 |
| UI 9.4 Account | 19 |
| UI 9.5 Parameters | 20 |
| UI 9.6 Security log | 18 |
| UI 10.1 Notifications | 12 |
| UI 10.4 Not available, Something went wrong, Being updated | 9, 21 |
| UI 11 addresses of the pages of this step | 8, 11, 12, 15, 17 to 20 |
| UI 12 journeys "Check the system" and the account half of "Welcome a new employee" | 24 |
| Master 8.1 to 8.4 frontend conventions | 2, 3, 7, 8 |
| Master 9.1 shell, workspaces, homes | 8, 13, 14, 15, 16 |
| Master 9.2 shared components | 5, 6, 7, 9 |
| Master 9.3 extension points | 8 (routes, homes, shared routes), 13 (`workspaceCounts.ts`), 17 (`SubjectFields.tsx`), 18 (`AuditLogPage`), 20 (`SettingsGroupPage`, `settings.json`) |
| Design tokens and the rules of `docs/design/README.md` | 1, 4, 5, 7, 14 |

Not covered here, by design: sorting in the two lists of this step (the accounts API orders by email and the logs newest first, with no sort parameter; `useListParams` carries `ordering` for the lists that have one), the "Concurrent action" row of UI 3.4 (the text `common:concurrent` exists; the first action that can collide is a decision, plan 03b), status sentences for requests (UI 3.5, plan 03b), and the installation, update and restore runbook (plan 07).

## Contract notes

Points where the master was silent or where this plan had to choose. Each one matters to a later plan or to the project owner.

**Differences from master snippets**

1. `api` is created with `baseUrl: window.location.origin`, not `"/"`. It is the same in a browser; Node, which runs the tests, cannot build a request from a relative address.
2. The font comes from `@fontsource/plus-jakarta-sans` at weights 400, 500, 600 and 700, not from the variable package: its family name is the one `tokens.css` uses, so the tokens file stays an exact copy.
3. The interface primitives in `components/ui/` are written by hand in shadcn/ui form over the Radix packages, so that control heights (40px, 44px on a phone), radii and colours are the tokens'. `components.json` is present, so `npx shadcn@latest add <name>` works for a later plan; what it adds must then be aligned with the tokens.
4. Toasts are a 60-line component of this plan, not a library.

**Additions other plans rely on**

5. A new extension point, `app/sharedRoutes.tsx`: routes inside the shell that belong to no workspace, with absolute paths. Plan 03b appends `/requests/:id` there. `router.tsx` is never edited after this plan.
6. Shared components beyond master 9.2: `Block` (a titled block of a home or detail page), `PageLoading`, `BeingUpdated`, `FilterText`, `FilterSelect`, `FilterDateRange` (controls for a `FilterBar`), `Toaster`, `useIsPhone`, `backToList`. All are exported from `@/components` and from their own file.
7. Exact shapes the master left open: `DataTable` takes `Column<T> = { key, header, cell(row), align? }` and an optional `label`, and turns its first column into the button that opens the row; `Pager` takes `{ page, pageSize, total, onPage }`; every bound input takes `{ control, name, label, hint?, optional? }`; `ConfirmDialog` takes either `trigger` or `open` with `onOpenChange`; `useListParams(defaults)` returns `{ filters, page, sort, query, setFilter, setPage, setSort }` and writes sorting as `ordering`; `EmptyState` takes `{ title, hint?, action? }`; `Figure` takes `{ label, value, hint? }`; `Disclosure` mounts its children only while open.
8. Conventions: components call `useTranslation()` without a namespace and write keys as `namespace:key` (the default namespace is `common`); a page does `if (query.isPending) return <PageLoading />; if (query.error) throw query.error;` and lets the shell's `ProblemBoundary` show "not available" or "something went wrong"; schemas are built with `t` inside the component so messages are already translated; response and request types come from `@/api/types`, derived from the generated schema, never written by hand.
9. Tests: they run in French; a missing translation key throws `Missing translation <namespace>:<key>`; `renderApp(ui, { route, path?, me?, queryClient? })` mounts the page under the registered pattern that matches `route` (pass `path` for an address that is not registered yet), shows `data-testid="elsewhere"` with the address when the page navigates away and `data-testid="signed-out"` when the user is gone; a test that needs specific pages to exist mocks the route arrays and `@/app/homes` with `vi.mock`, as `controls.test.tsx` does.
10. For plan 02: `features/accounts/SubjectFields.tsx` exports `SubjectFields({ control }: { control: Control<CreateAccountValues> })` and must draw the inputs and show the errors of `employee`, `full_name` and `email`. Setting `employee` to an employee's `public_id` makes name and email optional and changes the body sent (`createAccountForm.ts`).
11. For plan 05: the replacement of `features/shell/workspaceCounts.ts` must export `useWorkspaceCounts(): Partial<Record<WorkspaceId, number>>`.
12. For plan 06: `AuditLogPage` takes, besides `category`, the optional `actors`, `actionOptions` and `itemTypeOptions`. HR cannot list accounts, so the activity log needs `actors` (employees) to offer the "who" filter; business actions need their texts under `audit:actions.<object>.<verb>` in both languages, otherwise their code is shown.
13. For plans 03b, 04 and 06: a setting appears on `SettingsGroupPage` as soon as the API returns it; its two texts go to `settings.json` under `<key>.label` and `<key>.hint`.
14. For plan 07: Playwright runs Chromium on a desktop and a phone viewport; Firefox and Edge of NFR-07, and an automated accessibility scan, are left to hardening. The runbook should tell operators to use `scripts/server/compose.sh`, to keep `DJANGO_ALLOWED_HOSTS` equal to `SITE_HOSTNAME`, and how to install Caddy's root certificate or supply the company's in `proxy/certs/`. `scripts/server/restore.sh` of the master's layout is not written here: it belongs with the backups of plan 07, and must read the dumps of `dump.sh` (`gpg --decrypt` with `BACKUP_PASSPHRASE`, then `pg_restore`).

**Behaviour chosen where the specs did not say**

15. `APP_VERSION` on the server. The PRD wants one command given a version and an update that never writes to `.env`, and lists `APP_VERSION` among the variables of `.env`. `update.sh` exports the version for its own run and records it in `scripts/server/state/release` once the stack is healthy; `.env` keeps its installation value; `scripts/server/compose.sh` runs `docker compose` on the recorded version. A plain `docker compose up` on the server would bring back the version in `.env`, which is why the wrapper exists.
16. The pre-update dump is made inside the backend image (it carries `pg_dump` and `gpg`), encrypted with `BACKUP_PASSPHRASE`, and written to the backup volume under `/data/backups/pre-update/`, the ten newest kept. Nothing is installed on the server for it.
17. `update.sh` checks `.env` against the new version's `.env.example` read straight from Git, before the working tree changes, and waits up to three minutes for `/health` (it answers 503 until the worker's first heartbeat). It refuses to run where `COMPOSE_FILE` does not name `compose.server.yaml`.
18. The proxy container listens on `HTTPS_PORT` and `HTTP_PORT` themselves, so the redirect from HTTP names the right port when the test stack is on 8443.
19. Content-security policy: `script-src 'self'` with no inline script and no other origin; `style-src` allows inline style attributes, which the Radix primitives use to position menus and sheets. The policy is set on the application's pages; API answers keep the headers Django gives them.
20. While the application container is away, `/api` answers 503 with a static bilingual page; the React application treats 502, 503, 504 and a failed connection as "unavailable" and shows its own "being updated" page, which asks again every 15 seconds.
21. The language chosen on the Sign in page is stored on the account only when the user touched the choice; otherwise the account's language is applied. The "this is not production" strip is also shown on the Sign in page, from the public `health` answer.
22. The temporary password typed at sign-in is kept in memory (never in storage) for the "Choose a new password" page, so it is not typed twice; after a reload that page asks for it.
23. On their own account an administrator sees no reset, disable or role action, since the API refuses them (plan 01a, note 12).
24. Date and time inputs are the browser's own (`type="date"`, `type="time"`): they work with a keyboard, a screen reader and a phone, and show the date in the browser's regional format. Dates the application prints are always in the chosen language.
25. In the event detail of a log, field names are shown as the API records them (`is_active`, `locked_until`). They are technical information, one step away (M6); translating them would need a text per model field.
26. `last_workspace` is stored whenever the user is in a workspace different from the one recorded, one `PATCH auth/me` per switch.

**For the project owner**

27. Task 24 creates the private GitHub repository and Task 26 installs the test stack on the office server. Both need the owner's go-ahead, the GitHub account or organisation to use, a read-only token for the server, and the server and host name of PRD open item 7.
28. Without a company certificate, each office machine must trust Caddy's root certificate once (Task 26, Step 7). Supplying a certificate issued by the company's own authority in `proxy/certs/` avoids that.
