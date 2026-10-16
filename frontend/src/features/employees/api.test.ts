import { describe, expect, it } from "vitest";

import { documentFormData, isFullRecord } from "./api";
import { makeEmployee, makeTeamMember } from "./testing";

describe("isFullRecord", () => {
  it("tells the whole record from the team view", () => {
    expect(isFullRecord(makeEmployee())).toBe(true);
    expect(isFullRecord(makeTeamMember())).toBe(false);
  });
});

describe("documentFormData", () => {
  it("names the three parts the API reads", () => {
    const file = new File(["%PDF-1.4"], "contrat.pdf", { type: "application/pdf" });

    const form = documentFormData({ file, label: "Contrat", visible_to_employee: false });

    expect([...form.keys()].sort()).toEqual(["file", "label", "visible_to_employee"]);
    expect(form.get("visible_to_employee")).toBe("false");
  });
});
