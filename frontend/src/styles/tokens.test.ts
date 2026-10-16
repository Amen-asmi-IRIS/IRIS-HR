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
