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
    expect(Object.keys(nav).filter((key) => key.startsWith("team."))).toHaveLength(5);
    expect(Object.keys(nav).filter((key) => key.startsWith("hr."))).toHaveLength(6);
    expect(Object.keys(nav).filter((key) => key.startsWith("overview."))).toHaveLength(6);
    expect(Object.keys(nav).filter((key) => key.startsWith("admin."))).toHaveLength(4);
  });
});
