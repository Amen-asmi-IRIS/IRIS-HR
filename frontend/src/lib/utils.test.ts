import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cn, TEXT_SIZES } from "./utils";

describe("cn", () => {
  it("joins class names and drops falsy ones", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets a later Tailwind class win over an earlier one", () => {
    expect(cn("px-2 h-10", "px-4")).toBe("h-10 px-4");
  });

  it("keeps a text size of the design tokens beside a text colour", () => {
    expect(cn("text-caption font-medium", "text-primary")).toBe("text-caption font-medium text-primary");
    expect(cn("text-dialog font-semibold text-foreground")).toBe("text-dialog font-semibold text-foreground");
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("text-primary", "text-muted-foreground")).toBe("text-muted-foreground");
  });

  it("knows every text size of tokens.css", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles/tokens.css"), "utf8");
    const sizes = [...css.matchAll(/--text-([a-z]+): *\d+px/g)].map((match) => match[1]);
    expect([...TEXT_SIZES].sort()).toEqual([...new Set(sizes)].sort());
  });
});
