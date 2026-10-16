import { describe, expect, it } from "vitest";
import { FORM_FIELDS, fieldFor, type FormField } from "./problemFields";

const ALL = new Set<FormField>(FORM_FIELDS);
const problem = (code: string, field: string | null = null) => ({ field, code, detail: "", params: {} });

describe("the field a server problem belongs to (UI 5.3)", () => {
  it.each([
    ["request.end_before_start", "end_date"],
    ["request.period_too_long", "end_date"],
    ["request.no_working_day", "start_date"],
    ["request.overlap", "start_date"],
    ["request.past_dates", "start_date"],
    ["request.notice", "start_date"],
    ["request.balance_insufficient", "end_date"],
    ["request.cap_exceeded", "start_date"],
    ["request.event_required", "exceptional_event"],
    ["request.event_days_exceeded", "end_date"],
    ["request.permission_non_working_day", "start_date"],
    ["request.permission_times", "end_time"],
    ["request.permission_overlaps_absence", "start_date"],
    ["request.half_day_not_allowed", "starts_at_midday"],
    ["request.half_day_on_non_working_day", "starts_at_midday"],
    ["request.half_day_both_ends", "ends_at_midday"],
    ["request.dates_required", "start_date"],
    ["request.reason_required", "override_reason"],
    ["files.type_not_allowed", "file"],
    ["files.too_large", "file"],
    ["files.content_mismatch", "file"],
    ["files.empty", "file"],
  ])("%s goes to %s", (code, field) => {
    expect(fieldFor(problem(code), ALL)).toBe(field);
  });

  it("trusts the field the server names when the form has it", () => {
    expect(fieldFor(problem("request.half_day_on_non_working_day", "ends_at_midday"), ALL)).toBe("ends_at_midday");
    expect(fieldFor(problem("required", "comment"), ALL)).toBe("comment");
  });

  it("understands the server's own names for the same input", () => {
    expect(fieldFor(problem("required", "exceptional_event_id"), ALL)).toBe("exceptional_event");
  });

  it("sends a problem to the summary when its field is not on screen", () => {
    const permissionFields = new Set<FormField>(["start_date", "start_time", "end_time", "comment"]);
    expect(fieldFor(problem("request.balance_insufficient"), permissionFields)).toBeNull();
    expect(fieldFor(problem("files.too_large"), permissionFields)).toBeNull();
  });

  it("sends an unknown problem to the summary", () => {
    expect(fieldFor(problem("request.type_inactive"), ALL)).toBeNull();
    expect(fieldFor(problem("anything", "not_a_field"), ALL)).toBeNull();
  });
});
