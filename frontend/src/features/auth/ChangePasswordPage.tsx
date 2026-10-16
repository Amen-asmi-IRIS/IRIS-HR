import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormSummary } from "@/components/FormSummary";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { useChangePassword } from "./api";
import { EMPTY_PASSWORDS, passwordSchema, type PasswordValues } from "./passwordSchema";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const schema = useMemo(() => passwordSchema(t), [t]);
  const form = useForm<PasswordValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_PASSWORDS });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      await change.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      form.reset(EMPTY_PASSWORDS);
      toast(t("auth:newPassword.done"));
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <div className="max-w-md">
      <PageHeader title={t("auth:changePassword.title")} />
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
        <TextField control={form.control} name="current_password" label={t("auth:changePassword.current")} type="password" autoComplete="current-password" />
        <TextField control={form.control} name="new_password" label={t("auth:newPassword.new")} hint={t("auth:newPassword.rules")} type="password" autoComplete="new-password" />
        <TextField control={form.control} name="confirmation" label={t("auth:newPassword.confirmation")} type="password" autoComplete="new-password" />
        <div>
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t("auth:changePassword.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
