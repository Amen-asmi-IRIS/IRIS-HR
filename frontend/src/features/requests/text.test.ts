import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeRequest } from "@/features/requests/fixtures";
import type { Translate } from "./platform";
import { describeQuantity, describeWhen } from "./text";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

describe("dates in words", () => {
  it("gives a range as a range", () => {
    expect(describeWhen(makeRequest(), fr, "fr")).toBe("R(2026-11-09..2026-11-11)");
  });

  it("gives a single day as one date", () => {
    expect(describeWhen(makeRequest({ end_date: "2026-11-09" }), fr, "fr")).toBe("D(2026-11-09)");
  });

  it("says morning or afternoon for a single half-day", () => {
    const day = { end_date: "2026-11-09" };
    expect(describeWhen(makeRequest({ ...day, ends_at_midday: true }), fr, "fr")).toBe("D(2026-11-09), le matin");
    expect(describeWhen(makeRequest({ ...day, ends_at_midday: true }), en, "en")).toBe("D(2026-11-09), morning");
    expect(describeWhen(makeRequest({ ...day, starts_at_midday: true }), fr, "fr")).toBe("D(2026-11-09), l'après-midi");
    expect(describeWhen(makeRequest({ ...day, starts_at_midday: true }), en, "en")).toBe("D(2026-11-09), afternoon");
  });

  it("says which end of a range is a half-day", () => {
    expect(describeWhen(makeRequest({ starts_at_midday: true }), en, "en")).toBe(
      "R(2026-11-09..2026-11-11), from midday on the first day",
    );
    expect(describeWhen(makeRequest({ ends_at_midday: true }), en, "en")).toBe(
      "R(2026-11-09..2026-11-11), until midday on the last day",
    );
    expect(describeWhen(makeRequest({ starts_at_midday: true, ends_at_midday: true }), fr, "fr")).toBe(
      "R(2026-11-09..2026-11-11), de midi le premier jour à midi le dernier",
    );
  });

  it("gives a permission as a date and two times, without seconds", () => {
    const permission = makeRequest({
      type: { code: "permission", name: "Autorisation de sortie", unit: "hour" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:30:00",
      quantity: "2.50",
    });
    expect(describeWhen(permission, fr, "fr")).toBe("D(2026-11-09), de 14:00 à 16:30");
    expect(describeWhen(permission, en, "en")).toBe("D(2026-11-09), 14:00 to 16:30");
  });
});

describe("quantities in words", () => {
  it("counts days for day-based types and hours for the others", () => {
    expect(describeQuantity(makeRequest({ quantity: "2.50" }), "fr")).toBe("2.5 j");
    expect(describeQuantity(makeRequest({ type: { unit: "hour" }, quantity: "1.25" }), "fr")).toBe("1.25 h");
  });
});
