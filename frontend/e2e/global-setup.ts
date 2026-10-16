import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Empties the development database and loads the demo accounts, once before the suite. */
export default function globalSetup(): void {
  // scripts/e2e-container.sh runs the journeys in a container, where there is no docker command:
  // it resets the database itself, just before, and says so here.
  if (process.env.E2E_SKIP_RESET === "1") return;
  const root = fileURLToPath(new URL("../..", import.meta.url));
  execFileSync("docker", ["compose", "exec", "-T", "app", "python", "manage.py", "e2e_reset"], { cwd: root, stdio: "inherit" });
}
