import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { makeRequest, TYPES } from "@/features/requests/fixtures";
import type { Translate } from "../platform";
import type { RequestTypeOut } from "../types";
import { buildSchema, EMPTY, fromRequest, MAX_FILE_BYTES, previewReady, toFields, visibleFields, type FormValues } from "./schema";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));

function errorsOf(type: RequestTypeOut, values: Partial<FormValues>): Record<string, string> {
  const result = buildSchema(type, t).safeParse({ ...EMPTY, ...values });
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

function fileOf(name: string, type: string, size = 2048): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("form validation before anything is sent", () => {
  it("accepts a plain annual leave", () => {
    expect(errorsOf(TYPES.annual, { start_date: "2026-11-09", end_date: "2026-11-11" })).toEqual({});
  });

  it("asks for both dates", () => {
    expect(errorsOf(TYPES.annual, {})).toEqual({
      start_date: "Ce champ est nécessaire.",
      end_date: "Ce champ est nécessaire.",
    });
  });

  it("refuses an end before the start, on the end field", () => {
    expect(errorsOf(TYPES.annual, { start_date: "2026-11-11", end_date: "2026-11-09" })).toEqual({
      end_date: "La fin doit être le même jour que le début, ou après.",
    });
  });

  it("refuses a single day flagged at both ends, and accepts either half (master D12)", () => {
    const day = { start_date: "2026-11-09", end_date: "2026-11-09" };
    expect(errorsOf(TYPES.annual, { ...day, starts_at_midday: true, ends_at_midday: true })).toEqual({
      ends_at_midday: "Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux.",
    });
    expect(errorsOf(TYPES.annual, { ...day, starts_at_midday: true })).toEqual({});
    expect(errorsOf(TYPES.annual, { ...day, ends_at_midday: true })).toEqual({});
    expect(
      errorsOf(TYPES.annual, { start_date: "2026-11-09", end_date: "2026-11-10", starts_at_midday: true, ends_at_midday: true }),
    ).toEqual({});
  });

  it("asks a permission for one date and two times, the second after the first", () => {
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09" })).toEqual({
      start_time: "Ce champ est nécessaire.",
      end_time: "Ce champ est nécessaire.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "16:00", end_time: "14:00" })).toEqual({
      end_time: "L'heure de fin doit être après l'heure de début.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "14:00", end_time: "14:00" })).toEqual({
      end_time: "L'heure de fin doit être après l'heure de début.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "14:00", end_time: "16:00" })).toEqual({});
  });

  it("asks an exceptional leave for its event", () => {
    expect(errorsOf(TYPES.exceptional, { start_date: "2026-11-09", end_date: "2026-11-10" })).toEqual({
      exceptional_event: "Choisissez l'événement concerné.",
    });
  });

  it("asks for the reason when an exception is allowed", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-11" };
    expect(errorsOf(TYPES.annual, { ...dates, override: true, override_reason: "   " })).toEqual({
      override_reason: "Indiquez le motif : il est obligatoire.",
    });
    expect(errorsOf(TYPES.annual, { ...dates, override: true, override_reason: "Accord de la direction" })).toEqual({});
  });

  it("refuses a file that is not a PDF, a JPG or a PNG, even renamed", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-09" };
    const message = "Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG.";
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("certificat.pdf.txt", "text/plain") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("installeur.exe", "application/x-msdownload") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("certificat.pdf", "text/html") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("Certificat médical é.PDF", "application/pdf") })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("photo.jpeg", "image/jpeg") })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.png", "") })).toEqual({});
  });

  it("refuses a file larger than 10 MB and an empty file", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-09" };
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.pdf", "application/pdf", MAX_FILE_BYTES + 1) })).toEqual({
      file: "Ce fichier dépasse 10 Mo. Réduisez-le ou scannez-le en plus basse résolution.",
    });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.pdf", "application/pdf", MAX_FILE_BYTES) })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("vide.pdf", "application/pdf", 0) })).toEqual({
      file: "Ce fichier est vide. Choisissez-en un autre.",
    });
  });
});

describe("values to and from the API", () => {
  it("sends a permission as one date and two times", () => {
    expect(
      toFields({ ...EMPTY, start_date: "2026-11-09", end_date: "", start_time: "14:00", end_time: "16:30", comment: " Banque " }, TYPES.permission),
    ).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "14:00",
      end_time: "16:30",
      exceptional_event: null,
      comment: "Banque",
    });
  });

  it("sends the half-day flags only for a type that allows them", () => {
    const values = { ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", starts_at_midday: true, ends_at_midday: true };
    expect(toFields(values, TYPES.annual)).toMatchObject({ starts_at_midday: true, ends_at_midday: true, start_time: null, end_time: null });
    expect(toFields(values, TYPES.exceptional)).toMatchObject({ starts_at_midday: false, ends_at_midday: false });
  });

  it("sends the event as a number, and only for a type that uses events", () => {
    const values = { ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", exceptional_event: "4" };
    expect(toFields(values, TYPES.exceptional).exceptional_event).toBe(4);
    expect(toFields(values, TYPES.annual).exceptional_event).toBeNull();
  });

  it("reads a request back into form values", () => {
    const request = makeRequest({
      type: { code: "permission", unit: "hour" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:30:00",
      comment: "Banque",
      has_override: true,
    });
    // The exception of an HR request is fixed when it is created: it is never read back into the form.
    expect(fromRequest(request)).toEqual({
      ...EMPTY,
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      start_time: "14:00",
      end_time: "16:30",
      comment: "Banque",
    });
    expect(fromRequest(makeRequest({ event: { id: 4, name: "Mariage" } })).exceptional_event).toBe("4");
  });
});

describe("what the form shows and when it can ask for a preview", () => {
  const none = { hr: false, override: false, proofRequired: false };

  it("shows only the fields of the chosen type (M7)", () => {
    expect([...visibleFields(TYPES.annual, none)].sort()).toEqual(
      ["comment", "end_date", "ends_at_midday", "start_date", "starts_at_midday"].sort(),
    );
    expect([...visibleFields(TYPES.sick, none)]).toContain("file");
    expect([...visibleFields(TYPES.exceptional, none)].sort()).toEqual(["comment", "end_date", "exceptional_event", "start_date"].sort());
    expect([...visibleFields(TYPES.exceptional, { ...none, proofRequired: true })]).toContain("file");
    expect([...visibleFields(TYPES.permission, none)].sort()).toEqual(["comment", "end_time", "start_date", "start_time"].sort());
    expect([...visibleFields(TYPES.annual, { hr: true, override: true, proofRequired: false })]).toContain("override_reason");
    expect([...visibleFields(TYPES.annual, { hr: true, override: false, proofRequired: false })]).not.toContain("override_reason");
  });

  it("waits for coherent dates before asking the server", () => {
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09" }, TYPES.annual)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-11", end_date: "2026-11-09" }, TYPES.annual)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-11" }, TYPES.annual)).toBe(true);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", start_time: "14:00" }, TYPES.permission)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", start_time: "14:00", end_time: "16:00" }, TYPES.permission)).toBe(true);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10" }, TYPES.exceptional)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", exceptional_event: "1" }, TYPES.exceptional)).toBe(true);
  });
});
