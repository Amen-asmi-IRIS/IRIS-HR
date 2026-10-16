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
