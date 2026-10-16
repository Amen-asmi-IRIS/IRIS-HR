import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router";
import { z } from "zod";
import { safeNext } from "@/app/guards";
import { FormSummary } from "@/components/FormSummary";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { useProblemForm } from "@/components/useProblemForm";
import { isLang, LANGUAGES, setLanguage, useLang } from "@/i18n";
import { completeSignIn, signIn, updateMe, useHealth, useMe } from "./api";
import { AuthCard } from "./AuthCard";
import { rememberTemporaryPassword } from "./session";

interface SignInValues {
  email: string;
  password: string;
}

export default function SignInPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const queryClient = useQueryClient();
  const me = useMe();
  const health = useHealth();
  const [params] = useSearchParams();
  const [languageChosen, setLanguageChosen] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("form.required")),
        password: z.string().min(1, t("form.required")),
      }),
    [t],
  );
  const form = useForm<SignInValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;

  if (me.data) {
    const destination = me.data.must_change_password ? "/password/new" : (safeNext(params.get("next")) ?? "/");
    return <Navigate to={destination} replace />;
  }

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      let user = await signIn(values);
      if (user.must_change_password) rememberTemporaryPassword(values.password);
      if (languageChosen && user.language !== lang) {
        try {
          user = await updateMe({ language: lang });
        } catch {
          // Signed in all the same; the language can be changed again from the shell.
        }
      } else if (isLang(user.language)) {
        await setLanguage(user.language);
      }
      completeSignIn(queryClient, user);
    } catch (error) {
      problems.onError(error);
    }
  });

  return (
    <AuthCard title={t("auth:signIn.title")} environment={health.data?.environment}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          // A second click while the first is on its way does nothing.
          if (sending) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <FormSummary problems={problems.summary} />
        <TextField control={form.control} name="email" label={t("auth:signIn.email")} type="email" inputMode="email" autoComplete="username" />
        <TextField control={form.control} name="password" label={t("auth:signIn.password")} type="password" autoComplete="current-password" />
        <div role="group" aria-label={t("language.label")} className="flex gap-2">
          {LANGUAGES.map((code) => (
            <Button
              key={code}
              size="sm"
              variant={code === lang ? "secondary" : "ghost"}
              aria-pressed={code === lang}
              onClick={() => {
                setLanguageChosen(true);
                void setLanguage(code);
              }}
            >
              {t(`language.${code}`)}
            </Button>
          ))}
        </div>
        <Button type="submit" variant="primary" aria-busy={sending}>
          {t("auth:signIn.submit")}
        </Button>
      </form>
      <p className="mt-6 text-caption text-muted-foreground">{t("auth:signIn.noReset")}</p>
    </AuthCard>
  );
}
