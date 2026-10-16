import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/format";
import { formatCell } from "./cells";

describe("formatCell", () => {
  it("shows nothing for an empty cell", () => {
    expect(formatCell(null, "number", "fr")).toBe("");
    expect(formatCell(undefined, "text", "fr")).toBe("");
    expect(formatCell("", "date", "fr")).toBe("");
  });

  it("writes numbers the way the reader's language does, without trailing zeros", () => {
    expect(formatCell("1.50", "number", "fr")).toBe("1,5");
    expect(formatCell("1.50", "number", "en")).toBe("1.5");
    expect(formatCell("8.00", "number", "fr")).toBe("8");
    expect(formatCell(3, "number", "en")).toBe("3");
  });

  it("writes days, moments and periods as the rest of the application does", () => {
    expect(formatCell("2026-11-03", "date", "fr")).toBe(formatDate("2026-11-03", "fr"));
    expect(formatCell("2026-11-02T08:30:00+00:00", "datetime", "en")).toBe(formatDateTime("2026-11-02T08:30:00+00:00", "en"));
    expect(formatCell({ start: "2026-11-02", end: "2026-11-03" }, "period", "fr")).toBe(
      formatDateRange("2026-11-02", "2026-11-03", "fr"),
    );
    expect(formatCell({ start: "2026-11-13", end: "2026-11-13" }, "period", "fr")).toBe(formatDate("2026-11-13", "fr"));
  });

  it("leaves text as it is", () => {
    expect(formatCell("Amal Employee", "text", "fr")).toBe("Amal Employee");
  });
});
