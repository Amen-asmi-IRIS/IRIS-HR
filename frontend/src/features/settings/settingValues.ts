import type { TFunction } from "i18next";
import type { Setting } from "@/api/types";
import type { Lang } from "@/i18n";
import { isISODate } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";

/** What a control holds: text, a switch position, or the ticked choices. */
export type FieldValue = string | boolean | string[];

export type Parsed = { ok: true; value: unknown } | { ok: false; error: "whole" | "number" | "range" | "weekdays" | "list" | "date" };

type Shape = Pick<Setting, "kind" | "value" | "choices">;
type Limits = Pick<Setting, "kind" | "minimum" | "maximum" | "choices">;

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** From the API value to what the control holds. */
export function toField(setting: Shape): FieldValue {
  const { kind, value, choices } = setting;
  if (kind === "bool") return value === true;
  if (kind === "weekdays") return asList(value);
  if (kind === "str_list") return choices ? asList(value) : asList(value).join(", ");
  return value === null || value === undefined ? "" : String(value);
}

function outside(amount: number, setting: Limits): boolean {
  const { minimum, maximum } = setting;
  return (minimum !== null && minimum !== undefined && amount < Number(minimum)) || (maximum !== null && maximum !== undefined && amount > Number(maximum));
}

function whole(text: string, setting: Limits): Parsed {
  if (!/^-?\d+$/.test(text)) return { ok: false, error: "whole" };
  const amount = Number(text);
  return outside(amount, setting) ? { ok: false, error: "range" } : { ok: true, value: amount };
}

/** From what the control holds to the JSON the API expects for that kind, or what is wrong with it. */
export function fromField(setting: Limits, field: FieldValue): Parsed {
  const text = typeof field === "string" ? field.trim() : "";
  switch (setting.kind) {
    case "bool":
      return { ok: true, value: field === true };
    case "int":
      return whole(text, setting);
    case "int_or_null":
      return text === "" ? { ok: true, value: null } : whole(text, setting);
    case "decimal": {
      const normal = text.replace(",", ".");
      if (!/^-?\d+(\.\d+)?$/.test(normal)) return { ok: false, error: "number" };
      return outside(Number(normal), setting) ? { ok: false, error: "range" } : { ok: true, value: normal };
    }
    case "weekdays": {
      const days = asList(field).map(Number).sort((a, b) => a - b);
      return days.length === 0 ? { ok: false, error: "weekdays" } : { ok: true, value: days };
    }
    case "str_list": {
      if (setting.choices) {
        const chosen = asList(field);
        return chosen.length === 0 ? { ok: false, error: "list" } : { ok: true, value: chosen };
      }
      return { ok: true, value: text.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean) };
    }
    case "date_or_null":
      if (text === "") return { ok: true, value: null };
      return isISODate(text) ? { ok: true, value: text } : { ok: false, error: "date" };
    default:
      return { ok: true, value: field };
  }
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A value written for reading, on the read-only page. */
export function displayValue(setting: Shape, t: TFunction, lang: Lang): string {
  const { kind, value } = setting;
  if (value === null || value === undefined) return t("settings:none");
  if (kind === "bool") return value === true ? t("state.yes") : t("state.no");
  if (kind === "weekdays") return asList(value).map((day) => t(`weekdays.${day}`)).join(", ");
  if (kind === "str_list") return asList(value).map((entry) => entry.toUpperCase()).join(", ") || t("settings:none");
  if (kind === "date_or_null") return formatDate(String(value), lang);
  if (kind === "decimal") return formatNumber(String(value), lang);
  return String(value);
}
