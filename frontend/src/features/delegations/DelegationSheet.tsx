import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { DateField, FormSummary, TaskSheet, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";
import { useMyEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";

import { useCreateDelegation } from "./api";

export interface DelegationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The manager to delegate for. Left out, the signed-in manager delegates for themselves. */
  manager?: { public_id: string; name: string };
  defaultStart?: string;
  defaultEnd?: string;
}

interface Values {
  delegate: string;
  start_date: string;
  end_date: string;
}

export function DelegationSheet(props: DelegationSheetProps) {
  const { t } = useTranslation("delegations");
  const formId = useId();
  const title = props.manager ? t("sheet.titleFor", { name: props.manager.name }) : t("sheet.title");
  return (
    <TaskSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("sheet.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("sheet.cancel")}
          </Button>
        </>
      }
    >
      {props.open ? <DelegationForm formId={formId} {...props} /> : null}
    </TaskSheet>
  );
}

function DelegationForm({
  formId,
  manager,
  defaultStart = "",
  defaultEnd = "",
  onOpenChange,
}: DelegationSheetProps & { formId: string }) {
  const { t } = useTranslation("delegations");
  const me = useMyEmployee(!manager);
  const create = useCreateDelegation();
  const schema = z
    .object({
      delegate: z.string().min(1, t("sheet.required")),
      start_date: z.string().min(1, t("sheet.required")),
      end_date: z.string().min(1, t("sheet.required")),
    })
    .refine((values) => !values.start_date || !values.end_date || values.end_date >= values.start_date, {
      path: ["end_date"],
      message: t("sheet.endBeforeStart"),
    });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { delegate: "", start_date: defaultStart, end_date: defaultEnd },
  });
  const { onError, summary } = useProblemForm(form);
  const managerId = manager?.public_id ?? me.data?.public_id;

  const submit = form.handleSubmit((values) => {
    create.mutate(
      { ...(manager ? { manager: manager.public_id } : {}), ...values },
      {
        onSuccess: () => {
          toast(t("sheet.done"));
          onOpenChange(false);
        },
        onError,
      },
    );
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <Controller
        control={form.control}
        name="delegate"
        render={({ field, fieldState }) => (
          <EmployeePicker
            label={t("sheet.delegate")}
            value={field.value || null}
            onChange={(value) => field.onChange(value ?? "")}
            exclude={managerId ? [managerId] : []}
            error={fieldState.error?.message}
          />
        )}
      />
      <DateField control={form.control} name="start_date" label={t("sheet.start")} />
      <DateField control={form.control} name="end_date" label={t("sheet.end")} />
      <p className="text-body text-muted-foreground">{t("sheet.consequence")}</p>
    </form>
  );
}
