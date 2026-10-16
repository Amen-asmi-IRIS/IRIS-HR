import type { TFunction } from "i18next";
import { z } from "zod";
import type { AccountCreate } from "@/api/types";

/** The roles a System Administrator gives. Employee and Manager come from the organisation chart. */
export const ASSIGNABLE_ROLES = ["hr", "exec", "sysadmin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface CreateAccountValues {
  /** The `public_id` of the employee the account is for, or null for an account by name and email. */
  employee: string | null;
  full_name: string;
  email: string;
  roles: AssignableRole[];
}

export const EMPTY_ACCOUNT: CreateAccountValues = { employee: null, full_name: "", email: "", roles: [] };

export function createAccountSchema(t: TFunction) {
  return z
    .object({
      employee: z.string().nullable(),
      full_name: z.string().trim(),
      email: z.string().trim(),
      roles: z.array(z.enum(ASSIGNABLE_ROLES)),
    })
    .superRefine((values, context) => {
      if (!values.employee) {
        if (!values.full_name) context.addIssue({ code: "custom", path: ["full_name"], message: t("form.required") });
        if (!values.email) context.addIssue({ code: "custom", path: ["email"], message: t("form.required") });
      }
      if (values.roles.includes("hr") && values.roles.includes("sysadmin")) {
        context.addIssue({ code: "custom", path: ["roles"], message: t("accounts:create.rolesIncompatible") });
      }
    });
}

/** For an employee the API takes the name and the email from the record; otherwise they are sent. */
export function toAccountBody(values: CreateAccountValues): AccountCreate {
  const body = values.employee ? { employee: values.employee, roles: values.roles } : { full_name: values.full_name, email: values.email, roles: values.roles };
  return body as AccountCreate;
}
