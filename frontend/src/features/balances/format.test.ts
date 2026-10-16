import { describe, expect, it } from "vitest";

import { formatSigned, parseDays } from "./format";

describe("formatSigned", () => {
  it("writes the sign of a ledger line", () => {
    expect(formatSigned("2.50", "en")).toBe("+2.5");
    expect(formatSigned("-5.00", "en")).toBe("-5");
    expect(formatSigned(0, "en")).toBe("0");
  });

  it("uses the decimal comma in French", () => {
    expect(formatSigned("2.50", "fr")).toBe("+2,5");
    expect(formatSigned("-0.50", "fr")).toBe("-0,5");
  });
});

describe("parseDays", () => {
  it("accepts a comma or a dot as the decimal separator", () => {
    expect(parseDays("1,5")).toBe(1.5);
    expect(parseDays("1.5")).toBe(1.5);
    expect(parseDays(" 2 ")).toBe(2);
    expect(parseDays("-1")).toBe(-1);
  });

  it("refuses what is not a number", () => {
    expect(parseDays("")).toBeNull();
    expect(parseDays("   ")).toBeNull();
    expect(parseDays("abc")).toBeNull();
    expect(parseDays("1.2.3")).toBeNull();
    expect(parseDays("1,5 jours")).toBeNull();
  });
});
