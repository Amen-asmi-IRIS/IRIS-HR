import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("every journey of the UI document has a spec that exists", () => {
  const text = fs.readFileSync(path.join(HERE, "JOURNEYS.md"), "utf8");
  const rows = text.split("\n").filter((line) => /^\| \d+ \|/.test(line));
  expect(rows).toHaveLength(16);
  for (const line of rows) {
    const cells = line.split("|").map((cell) => cell.trim());
    const specs = cells[5].split(",").map((name) => name.replace(/`/g, "").trim()).filter(Boolean);
    expect(specs.length, `no spec named for: ${cells[2]}`).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(fs.existsSync(path.join(HERE, spec)), `${spec} does not exist`).toBe(true);
    }
  }
});
