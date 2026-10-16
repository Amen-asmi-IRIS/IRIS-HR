import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { makeRequest } from "@/features/requests/fixtures";
import { currentDates, dateIssues, datesOf, datesReady, hhmm, sameAsCurrent } from "./dates";
import type { Translate } from "./platform";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));
const leave = makeRequest();
const permission = makeRequest({
  type: { code: "permission", unit: "hour" },
  end_date: "2026-11-09",
  start_time: "14:00:00",
  end_time: "16:00:00",
});

describe("the dates of a change or a correction", () => {
  it("reads the current dates of a request, times without seconds", () => {
    expect(currentDates(leave)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "",
      end_time: "",
    });
    expect(currentDates(permission)).toMatchObject({ start_time: "14:00", end_time: "16:00" });
    expect(hhmm(null)).toBe("");
  });

  it("knows when nothing changed", () => {
    expect(sameAsCurrent(currentDates(leave), leave)).toBe(true);
    expect(sameAsCurrent({ ...currentDates(leave), end_date: "2026-11-12" }, leave)).toBe(false);
    expect(sameAsCurrent({ ...currentDates(leave), ends_at_midday: true }, leave)).toBe(false);
    expect(sameAsCurrent(currentDates(permission), permission)).toBe(true);
    expect(sameAsCurrent({ ...currentDates(permission), end_time: "17:00" }, permission)).toBe(false);
  });

  it("gives the dates as the API takes them: a permission has one date and two times", () => {
    expect(datesOf({ ...currentDates(leave), starts_at_midday: true }, false)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: true,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
    });
    expect(datesOf({ ...currentDates(permission), end_date: "", ends_at_midday: true }, true)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "14:00",
      end_time: "16:00",
    });
  });

  it("knows when the dates are coherent enough to ask the server", () => {
    expect(datesReady(currentDates(leave), false)).toBe(true);
    expect(datesReady({ ...currentDates(leave), end_date: "2026-11-01" }, false)).toBe(false);
    expect(datesReady({ ...currentDates(leave), start_date: "" }, false)).toBe(false);
    expect(datesReady(currentDates(permission), true)).toBe(true);
    expect(datesReady({ ...currentDates(permission), end_time: "13:00" }, true)).toBe(false);
  });

  it("says what cannot be right, on the input concerned", () => {
    expect(dateIssues(currentDates(leave), false, t)).toEqual([]);
    expect(dateIssues({ ...currentDates(leave), end_date: "2026-11-01" }, false, t)).toEqual([
      ["end_date", "La fin doit être le même jour que le début, ou après."],
    ]);
    expect(
      dateIssues({ ...currentDates(leave), end_date: "2026-11-09", starts_at_midday: true, ends_at_midday: true }, false, t),
    ).toEqual([["ends_at_midday", "Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."]]);
    expect(dateIssues({ ...currentDates(permission), end_time: "14:00" }, true, t)).toEqual([
      ["end_time", "L'heure de fin doit être après l'heure de début."],
    ]);
    expect(dateIssues({ ...currentDates(leave), start_date: "", end_date: "" }, false, t)).toEqual([
      ["start_date", "Ce champ est nécessaire."],
      ["end_date", "Ce champ est nécessaire."],
    ]);
  });
});
