import type { TFunction } from "i18next";
import { z } from "zod";

export interface PasswordValues {
  current_password: string;
  new_password: string;
  confirmation: string;
}

export const EMPTY_PASSWORDS: PasswordValues = { current_password: "", new_password: "", confirmation: "" };

/** The checks the browser can make. The server makes them again, and more (common passwords, similarity). */
export function passwordSchema(t: TFunction) {
  return z
    .object({
      current_password: z.string().min(1, t("form.required")),
      new_password: z.string().min(12, t("auth:newPassword.tooShort")),
      confirmation: z.string().min(1, t("form.required")),
    })
    .refine((values) => values.new_password === values.confirmation, {
      path: ["confirmation"],
      message: t("auth:newPassword.mismatch"),
    });
}
