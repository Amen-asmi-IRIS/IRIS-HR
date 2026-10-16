import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { BUSINESS_ACTIONS, ITEM_TYPES } from "./activity";

describe("the activity log's vocabulary", () => {
  it("has a text in both languages for every business action", () => {
    for (const action of BUSINESS_ACTIONS) {
      for (const lng of ["fr", "en"]) {
        expect(i18n.exists(`audit:actions.${action}`, { lng }), `${action} in ${lng}`).toBe(true);
      }
    }
  });

  it("has a name in both languages for every kind of item", () => {
    for (const type of ITEM_TYPES) {
      for (const lng of ["fr", "en"]) {
        expect(i18n.exists(`reports:activity.items.${type}`, { lng }), `${type} in ${lng}`).toBe(true);
      }
    }
  });

  it("covers the actions this plan records", () => {
    expect(BUSINESS_ACTIONS).toEqual(expect.arrayContaining(["report.exported", "export.kpmg", "step.decided", "employee.archived"]));
  });
});
