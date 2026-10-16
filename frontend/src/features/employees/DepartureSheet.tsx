import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";

import { ProblemError } from "@/api/problem";
import { DateField, FormSummary, TaskSheet, TextAreaField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";

import { type Employee, useArchiveEmployee, useArchivePreview } from "./api";

interface Props {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Values {
  leaving_date: string;
  reason: string;
}

export function DepartureSheet({ employee, open, onOpenChange }: Props) {
  const { t } = useTranslation("employees");
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("departure.title", { name: employee.name })}
      footer={
        <>
          <Button type="submit" form={formId} variant="destructive">
            {t("departure.confirm")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      {open ? <DepartureForm formId={formId} employee={employee} onDone={() => onOpenChange(false)} /> : null}
    </TaskSheet>
  );
}

function Items({ items }: { items: { label: string; link: string }[] }) {
  return (
    <ul className="mt-1 grid gap-0.5 pl-4">
      {items.map((item) => (
        <li key={`${item.label}|${item.link}`}>
          {item.link ? (
            <Link className="text-primary underline-offset-4 hover:underline" to={item.link}>
              {item.label}
            </Link>
          ) : (
            item.label
          )}
        </li>
      ))}
    </ul>
  );
}

function DepartureForm({ formId, employee, onDone }: { formId: string; employee: Employee; onDone: () => void }) {
  const { t } = useTranslation("employees");
  const preview = useArchivePreview(employee.public_id);
  const archive = useArchiveEmployee(employee.public_id);
  const schema = z.object({
    leaving_date: z.string().min(1, t("form.required")),
    reason: z.string().trim().min(1, t("form.required")),
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { leaving_date: "", reason: "" } });
  const { onError, summary } = useProblemForm(form);
  // A month's leave credit is posted once the month is over and never taken back (plan 04): with a leaving date in a
  // month already over, the credits posted since are HR's to remove by hand.
  const leaving = form.watch("leaving_date");
  const creditsPosted = leaving !== "" && leaving < `${todayISO().slice(0, 8)}01`;

  // The promise, not the callbacks of `mutate`: once the record is read again as "left", the page
  // removes this sheet, and callbacks given to `mutate` are dropped once their component is gone.
  const submit = form.handleSubmit(async (values) => {
    try {
      await archive.mutateAsync(values);
      toast(t("departure.done"));
      onDone();
    } catch (error) {
      if (error instanceof ProblemError && error.status === 409) {
        // Someone else recorded it first: say so and show the current state.
        toast(error.detail);
        onDone();
        return;
      }
      onError(error);
    }
  });

  const headingId = `${formId}-consequences`;
  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <DateField control={form.control} name="leaving_date" label={t("departure.date")} />
      <TextAreaField control={form.control} name="reason" label={t("departure.reason")} />
      <section aria-labelledby={headingId} className="grid gap-3 rounded-xl border border-border bg-muted p-4">
        <h3 id={headingId} className="text-body font-semibold">
          {t("departure.consequences")}
        </h3>
        {preview.isPending ? (
          <p role="status">{t("record.loading")}</p>
        ) : (
          <ul className="grid list-disc gap-2 pl-5 text-body">
            {preview.data?.has_account ? <li>{t("departure.account")}</li> : null}
            <li>{t("departure.credit")}</li>
            {creditsPosted ? <li>{t("departure.creditPosted")}</li> : null}
            <li>{t("departure.kept")}</li>
            {preview.data && preview.data.reports.length > 0 ? (
              <li>
                {t("departure.reports")}
                <Items items={preview.data.reports} />
              </li>
            ) : null}
            {(preview.data?.sections ?? []).map((section) => (
              <li key={section.key}>
                {t(`departure.sections.${section.key}`, { defaultValue: section.key })}
                <Items items={section.items} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
