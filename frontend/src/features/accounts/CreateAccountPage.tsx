import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useResolvedPath } from "react-router";
import type { AccountCreated } from "@/api/types";
import { FormSummary } from "@/components/FormSummary";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { backToList } from "@/components/useListParams";
import { useProblemForm } from "@/components/useProblemForm";
import { useCreateAccount } from "./api";
import { createAccountSchema, EMPTY_ACCOUNT, toAccountBody, type CreateAccountValues } from "./createAccountForm";
import { RolesField } from "./RolesField";
import { SubjectFields } from "./SubjectFields";
import { TemporaryPassword } from "./TemporaryPassword";

/** Create an account and hand over its temporary password (UI 9.3). */
export default function CreateAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listPath = useResolvedPath("..", { relative: "path" }).pathname;
  const create = useCreateAccount();
  // The only place the temporary password is kept. Leaving the page drops it.
  const [created, setCreated] = useState<AccountCreated | null>(null);

  const schema = useMemo(() => createAccountSchema(t), [t]);
  const form = useForm<CreateAccountValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_ACCOUNT });
  const problems = useProblemForm(form);
  const sending = form.formState.isSubmitting;
  const back = backToList(listPath);

  const submit = form.handleSubmit(async (values) => {
    problems.clear();
    try {
      setCreated(await create.mutateAsync(toAccountBody(values)));
    } catch (error) {
      problems.onError(error);
    }
  });

  if (created) {
    return (
      <>
        <PageHeader title={t("accounts:create.title")} />
        <TemporaryPassword
          title={t("accounts:create.created", { name: created.account.name })}
          password={created.temporary_password}
          expiresAt={created.expires_at}
          onDone={() => navigate(back)}
        />
      </>
    );
  }

  return (
    <div className="max-w-md">
      <PageHeader title={t("accounts:create.title")} back={back} />
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
        <SubjectFields control={form.control} />
        <RolesField control={form.control} />
        <div>
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t("accounts:create.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
