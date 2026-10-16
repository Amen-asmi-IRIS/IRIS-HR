import type { i18n as I18n, TFunction } from "i18next";
import i18next, { isLang } from "@/i18n";
import { formatDateRange } from "@/lib/format";

/** The security actions the API records (plan 01a). Each has a text under audit:actions. */
export const SECURITY_ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.locked",
  "auth.logout",
  "auth.session_expired",
  "auth.password_changed",
  "auth.password_reset",
  "account.created",
  "account.disabled",
  "account.enabled",
  "account.unlocked",
  "role.assigned",
  "role.removed",
  "setting.changed",
  "audit.exported",
] as const;

/**
 * What the API stores as the label of a failed sign-in when the text typed in the email box did not have the
 * shape of an address (`apps.accounts.emails.NOT_AN_ADDRESS`). It is fixed English text, so the page translates it.
 */
export const NOT_AN_ADDRESS = "(not an email address)";

/**
 * What an event is about, as the reader sees it. A label is a name or an address and is shown as stored, except
 * the fixed texts and the keys the API writes itself: those are put in the reader's language, so no screen mixes the two (U9).
 */
export function objectLabel(
  event: { action: string; object_type: string; object_id?: string; object_label: string },
  t: TFunction,
): string {
  const label = event.object_label;
  if (label === NOT_AN_ADDRESS) return t("audit:notAnAddress");
  // An export is recorded with the category of the log that was exported.
  if (event.action === "audit.exported" && event.object_type === "audit_log" && (label === "security" || label === "business")) {
    return t(`audit:${label}.title`);
  }
  // A file recorded without its name (a medical one) is labelled "kind:identifier": the reader gets the kind in words.
  if (event.object_type === "attachment") {
    const kind = /^([a-z_]+):[0-9a-f-]{36}$/.exec(label)?.[1];
    if (kind && i18next.exists(`audit:attachments.${kind}`)) return t(`audit:attachments.${kind}`);
  }
  // A report export is recorded with the report's title in the exporter's language; its name is the identifier (plan 06).
  if (event.action === "report.exported" && event.object_type === "report" && event.object_id) {
    const key = `reports:names.${event.object_id}`;
    if (i18next.exists(key)) return t(key);
  }
  // A KPMG export is recorded as "<title in the exporter's language> <first day> <last day>".
  if (event.action === "export.kpmg" && event.object_type === "export") {
    const period = /(\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})$/.exec(label);
    if (period) {
      const lang = isLang(i18next.language) ? i18next.language : "fr";
      return t("reports:activity.kpmgLabel", { period: formatDateRange(period[1], period[2], lang) });
    }
  }
  // A parameter is recorded under its key; the reader knows it by the label of the Parameters page.
  if (event.object_type === "setting") {
    const key = `settings:${label}.label`;
    if (i18next.exists(key)) return t(key);
  }
  return label;
}

/** What happened, in words. An action that has no text yet is shown by its code rather than hidden. */
export function actionLabel(action: string, t: TFunction, i18n: I18n): string {
  const key = `audit:actions.${action}`;
  return i18n.exists(key) ? t(key) : action;
}
