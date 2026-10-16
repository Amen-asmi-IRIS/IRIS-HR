import { describe, expect, it } from "vitest";
import { HR_SETTINGS_SUBJECTS } from "@/features/settings/hrSubjects";
import i18n from "@/i18n";

const LANGUAGES = ["fr", "en"] as const;

describe("the request engine in the HR settings (UI 7.12)", () => {
  it("adds its five subjects before departments, in the order of the UI", () => {
    const ordered = [...HR_SETTINGS_SUBJECTS].sort((a, b) => a.order - b.order);
    expect(ordered.slice(0, 5).map((subject) => [subject.id, subject.path])).toEqual([
      ["request-types", "/hr/settings/request-types"],
      ["steps", "/hr/settings/steps"],
      ["events", "/hr/settings/events"],
      ["holidays", "/hr/settings/holidays"],
      ["parameters", "/hr/settings/parameters"],
    ]);
    expect(ordered.map((subject) => subject.id)).toContain("departments");
  });

  it("gives each subject a title and a description in both languages", () => {
    for (const subject of HR_SETTINGS_SUBJECTS) {
      for (const lng of LANGUAGES) {
        expect(i18n.exists(subject.titleKey, { lng }), `${subject.titleKey} (${lng})`).toBe(true);
        expect(i18n.exists(subject.descriptionKey, { lng }), `${subject.descriptionKey} (${lng})`).toBe(true);
      }
    }
  });

  it("labels the three parameters of the request engine in both languages", () => {
    for (const key of ["working_week", "certificate_deadline_hours", "certificate_warning_hours"]) {
      for (const lng of LANGUAGES) {
        expect(i18n.exists(`settings:${key}.label`, { lng }), `${key}.label (${lng})`).toBe(true);
        expect(i18n.exists(`settings:${key}.hint`, { lng }), `${key}.hint (${lng})`).toBe(true);
      }
    }
  });
});
