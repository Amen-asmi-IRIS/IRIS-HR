import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { FormSummary } from "@/components/FormSummary";
import { TextField } from "@/components/TextField";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { useChangePassword, useCurrentUser, useLogout } from "./api";
import { AuthCard } from "./AuthCard";
import { passwordSchema, type PasswordValues } from "./passwordSchema";
import { forgetTemporaryPassword, temporaryPasswordInMemory } from "./session";

export default function ChooseNewPasswordPage() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const change = useChangePassword();
  const logout = useLogout();
  // Typed a moment ago at Sign in; after a reload it is gone and the page asks for it.
  const [remembered] = useState(() => temporaryPasswordInMemory());

  const schema = useMemo(() => passwordSchema(t), [t]);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: remembered ?? "", new_password: "", confirmation: "" },
  });
  const problems = useProblemForm(form, {
    mapField: (field) => (field === "current_password" && remembered !== null ? null : field),
  });
  const sending = form.formState.isSubmitting;

  if (!me.must_change_password) return <Navigate to="/" replace />;

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      await change.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      forgetTemporaryPassword();
      toast(t("auth:newPassword.done"));
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <AuthCard title={t("auth:newPassword.title")} environment={me.environment}>
      <p className="mb-4 text-body text-text-secondary">{t("auth:newPassword.intro")}</p>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        {remembered === null && (
          <TextField control={form.control} name="current_password" label={t("auth:newPassword.temporary")} type="password" autoComplete="current-password" />
        )}
        <TextField control={form.control} name="new_password" label={t("auth:newPassword.new")} hint={t("auth:newPassword.rules")} type="password" autoComplete="new-password" />
        <TextField control={form.control} name="confirmation" label={t("auth:newPassword.confirmation")} type="password" autoComplete="new-password" />
        <Button type="submit" variant="primary" aria-busy={sending}>
          {t("auth:newPassword.submit")}
        </Button>
      </form>
      <div className="mt-6">
        <Button variant="link" size="inline" onClick={() => logout.mutate()}>
          {t("auth:newPassword.signOut")}
        </Button>
      </div>
    </AuthCard>
  );
}
