import { z } from "zod";
import type { Translate } from "../platform";
import type { RequestFields, RequestOut, RequestTypeOut } from "../types";
import type { FormField } from "./problemFields";

export interface FormValues {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string;
  end_time: string;
  exceptional_event: string;
  comment: string;
  file: File | null;
  override: boolean;
  override_reason: string;
}

export const EMPTY: FormValues = {
  start_date: "",
  end_date: "",
  starts_at_midday: false,
  ends_at_midday: false,
  start_time: "",
  end_time: "",
  exceptional_event: "",
  comment: "",
  file: null,
  override: false,
  override_reason: "",
};

/** REQ-16: PDF, JPG and PNG up to 10 MB. The server checks again, including the content. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_NAME = /\.(pdf|jpe?g|png)$/i;

/** Client-side checks that need no server: what is missing, and what cannot be right. */
export function buildSchema(type: RequestTypeOut, t: Translate) {
  return z
    .object({
      start_date: z.string(),
      end_date: z.string(),
      starts_at_midday: z.boolean(),
      ends_at_midday: z.boolean(),
      start_time: z.string(),
      end_time: z.string(),
      exceptional_event: z.string(),
      comment: z.string(),
      file: z.custom<File | null>((value) => value === null || value instanceof File),
      override: z.boolean(),
      override_reason: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: FormField, message: string) => context.addIssue({ code: "custom", path: [path], message });

      // Every rule lives in this one refinement, so all messages appear together.
      if (!values.start_date) issue("start_date", t("formErrors.required"));
      if (type.unit === "day") {
        if (!values.end_date) issue("end_date", t("formErrors.required"));
        else if (values.start_date && values.end_date < values.start_date) issue("end_date", t("formErrors.endBeforeStart"));
        const singleDay = values.start_date !== "" && values.start_date === values.end_date;
        if (type.allows_half_day && singleDay && values.starts_at_midday && values.ends_at_midday) {
          issue("ends_at_midday", t("formErrors.bothHalves"));
        }
      } else {
        if (!values.start_time) issue("start_time", t("formErrors.required"));
        if (!values.end_time) issue("end_time", t("formErrors.required"));
        if (values.start_time && values.end_time && values.end_time <= values.start_time) {
          issue("end_time", t("formErrors.times"));
        }
      }
      if (type.uses_events && !values.exceptional_event) issue("exceptional_event", t("formErrors.eventRequired"));
      if (values.override && values.override_reason.trim() === "") issue("override_reason", t("formErrors.reasonRequired"));

      const fileMessage = values.file ? fileProblem(values.file, t) : null;
      if (fileMessage) issue("file", fileMessage);
    });
}

/** Why a chosen file cannot be sent, or null when it can. Shared by every place a file is chosen. */
export function fileProblem(file: File, t: Translate): string | null {
  const typeIsWrong = file.type !== "" && !ALLOWED_TYPES.includes(file.type);
  if (!ALLOWED_NAME.test(file.name) || typeIsWrong) return t("formErrors.fileType");
  if (file.size === 0) return t("formErrors.fileEmpty");
  if (file.size > MAX_FILE_BYTES) return t("formErrors.fileSize");
  return null;
}

/** The inputs shown for a type (M7). */
export function visibleFields(
  type: RequestTypeOut,
  options: { hr: boolean; override: boolean; proofRequired: boolean },
): Set<FormField> {
  const fields = new Set<FormField>(["start_date", "comment"]);
  if (type.unit === "day") {
    fields.add("end_date");
    if (type.allows_half_day) {
      fields.add("starts_at_midday");
      fields.add("ends_at_midday");
    }
  } else {
    fields.add("start_time");
    fields.add("end_time");
  }
  if (type.uses_events) fields.add("exceptional_event");
  if (type.document_rule === "required_within_deadline" || options.proofRequired) fields.add("file");
  if (options.hr && options.override) fields.add("override_reason");
  return fields;
}

/** Form values as the request fields of the API (master 7.9). A permission has one date and two times. */
export function toFields(values: FormValues, type: RequestTypeOut): RequestFields {
  const hourly = type.unit === "hour";
  const halfDays = !hourly && type.allows_half_day;
  return {
    start_date: values.start_date,
    end_date: hourly ? values.start_date : values.end_date,
    starts_at_midday: halfDays && values.starts_at_midday,
    ends_at_midday: halfDays && values.ends_at_midday,
    start_time: hourly ? values.start_time : null,
    end_time: hourly ? values.end_time : null,
    exceptional_event: type.uses_events && values.exceptional_event ? Number(values.exceptional_event) : null,
    comment: values.comment.trim(),
  };
}

export function fromRequest(request: RequestOut): FormValues {
  return {
    ...EMPTY,
    start_date: request.start_date,
    end_date: request.end_date,
    starts_at_midday: request.starts_at_midday,
    ends_at_midday: request.ends_at_midday,
    start_time: (request.start_time ?? "").slice(0, 5),
    end_time: (request.end_time ?? "").slice(0, 5),
    exceptional_event: request.event ? String(request.event.id) : "",
    comment: request.comment ?? "",
  };
}

/** Whether there is enough, and nothing obviously wrong, to ask the server what it computes. */
export function previewReady(values: FormValues, type: RequestTypeOut): boolean {
  if (!values.start_date) return false;
  if (type.uses_events && !values.exceptional_event) return false;
  if (type.unit === "hour") {
    return values.start_time !== "" && values.end_time !== "" && values.end_time > values.start_time;
  }
  return values.end_date !== "" && values.end_date >= values.start_date;
}
