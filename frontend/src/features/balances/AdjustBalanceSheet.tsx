import { zodResolver } from "@hookform/resolvers/zod";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { DateField, FormSummary, TaskSheet, TextAreaField, TextField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useAdjustBalance, useBalance, type AdjustmentKind } from "./api";
import { parseDays } from "./format";

interface Props {
  employeeId: string;
  kind: AdjustmentKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  direction: "add" | "remove";
  amount: string;
  effective_date: string;
  reason: string;
}

function todayInTunis(): string {
  // "en-CA" writes a date as YYYY-MM-DD, the value a date input expects
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
}

/** The signed number of days the form stands for, or null while the amount is not a number. */
export function signedAmount(kind: AdjustmentKind, direction: FormValues["direction"], amount: string): number | null {
  const days = parseDays(amount);
  if (days === null) return null;
  return kind === "adjustment" && direction === "remove" ? -days : days;
}

/**
 * HR adds or removes days, or records the opening balance (UI 7.9). Save is never disabled: without a reason it
 * says so next to the field and sends nothing.
 */
export function AdjustBalanceSheet({ employeeId, kind, open, onOpenChange }: Props) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const formId = useId();
  const balance = useBalance(employeeId);
  const adjust = useAdjustBalance(employeeId);
  // A ref, not `adjust.isPending`: two clicks can both arrive before React draws the pending state.
  const sending = useRef(false);

  const schema = useMemo(
    () =>
      z.object({
        direction: z.enum(["add", "remove"]),
        amount: z
          .string()
          .refine((value) => parseDays(value) !== null, t("adjust.amountInvalid"))
          .refine((value) => kind === "opening" || (parseDays(value) ?? 1) > 0, t("adjust.amountPositive")),
        effective_date: z.string().min(1, t("adjust.dateRequired")),
        reason: z.string().refine((value) => value.trim().length > 0, t("adjust.reasonRequired")),
      }),
    [kind, t],
  );
  // An opening balance is stated as of the day before monthly credits start (master D11); without a start date,
  // and for an adjustment, today is proposed. HR may choose another date.
  const openingDate = kind === "opening" ? (balance.data?.opening_date ?? null) : null;
  const [firstDate] = useState(() => openingDate ?? todayInTunis());
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { direction: "add", amount: "", effective_date: firstDate, reason: "" },
  });
  const { onError, summary } = useProblemForm(form);

  // The sheet may open before the balance is read: the date is proposed once known, unless HR already chose one.
  useEffect(() => {
    if (openingDate && form.getValues("effective_date") === firstDate) form.setValue("effective_date", openingDate);
  }, [form, firstDate, openingDate]);
  const noStartDate = kind === "opening" && balance.data !== undefined && balance.data.opening_date === null;

  const [direction, amount] = form.watch(["direction", "amount"]);
  const signed = signedAmount(kind, direction, amount);
  const current = balance.data ? Number(balance.data.current) : null;
  const after = current !== null && signed !== null ? current + signed : null;

  const send = (values: FormValues) => {
    const days = signedAmount(kind, values.direction, values.amount);
    if (days === null) {
      sending.current = false;
      return;
    }
    adjust.mutate(
      { kind, amount: String(days), effective_date: values.effective_date, reason: values.reason.trim() },
      {
        // Once the line is saved the sheet closes: the guard stays taken, so a late second click sends nothing.
        onSuccess: () => {
          toast(t("adjust.done"));
          onOpenChange(false);
        },
        onError: (error) => {
          sending.current = false;
          onError(error);
        },
      },
    );
  };

  // The guard is taken before the form is checked, which takes a moment of its own: a second click in that
  // moment, or while the line is being saved, or after, sends nothing.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    void form.handleSubmit(send, () => {
      sending.current = false;
    })(event);
  };

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(kind === "opening" ? "adjust.titleOpening" : "adjust.titleAdjustment", {
        name: balance.data?.employee.name ?? "",
      })}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("adjust.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("adjust.cancel")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormSummary problems={summary} />
        {current !== null && <p className="text-body">{t("adjust.current", { balance: formatDays(current, lang) })}</p>}
        {kind === "adjustment" && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body font-medium">{t("adjust.direction")}</legend>
            <label className="flex min-h-11 items-center gap-3 text-body">
              <input type="radio" value="add" className="size-4 accent-primary" {...form.register("direction")} />
              {t("adjust.add")}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-body">
              <input type="radio" value="remove" className="size-4 accent-primary" {...form.register("direction")} />
              {t("adjust.remove")}
            </label>
          </fieldset>
        )}
        <TextField
          control={form.control}
          name="amount"
          inputMode="decimal"
          label={t(kind === "opening" ? "adjust.openingAmount" : "adjust.amount")}
          hint={kind === "opening" ? t("adjust.openingHint") : undefined}
        />
        <DateField
          control={form.control}
          name="effective_date"
          label={t("adjust.date")}
          hint={noStartDate ? t("adjust.openingNoStartDate") : undefined}
        />
        <TextAreaField control={form.control} name="reason" label={t("adjust.reason")} hint={t("adjust.reasonHint")} />
        <p aria-live="polite" className="text-body font-semibold">
          {after !== null && t("adjust.after", { balance: formatDays(after, lang) })}
        </p>
      </form>
    </TaskSheet>
  );
}
