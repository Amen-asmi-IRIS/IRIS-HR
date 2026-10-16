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
