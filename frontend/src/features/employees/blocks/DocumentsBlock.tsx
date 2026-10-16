import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FileField, FormSummary, SwitchField, TaskSheet, TextField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";

import { type EmployeeDetail, useAddDocument } from "../api";
import { DocumentList } from "../DocumentList";
import type { RecordMode } from "../recordTypes";

export function DocumentsBlock({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid gap-3">
      <DocumentList employeeId={employee.public_id} sharing={mode === "hr" ? "manage" : "show"} />
      {mode === "hr" ? (
        <>
          <div>
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              {t("documents.add")}
            </Button>
          </div>
          <AddDocumentSheet employeeId={employee.public_id} open={adding} onOpenChange={setAdding} />
        </>
      ) : null}
    </div>
  );
}

interface SheetProps {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddDocumentSheet({ employeeId, open, onOpenChange }: SheetProps) {
  const { t } = useTranslation("employees");
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("documents.sheet.title")}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("documents.sheet.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      {open ? <AddDocumentForm formId={formId} employeeId={employeeId} onDone={() => onOpenChange(false)} /> : null}
    </TaskSheet>
  );
}

interface Values {
  file: File | null;
  label: string;
  visible_to_employee: boolean;
}

function AddDocumentForm({ formId, employeeId, onDone }: { formId: string; employeeId: string; onDone: () => void }) {
  const { t } = useTranslation("employees");
  const add = useAddDocument(employeeId);
  const schema = z.object({
    file: z.custom<File | null>((value) => value instanceof File, t("form.required")),
    label: z.string().trim().min(1, t("form.required")),
    visible_to_employee: z.boolean(),
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { file: null, label: "", visible_to_employee: false },
  });
  const { onError, summary } = useProblemForm(form);

  const submit = form.handleSubmit((values) => {
    if (!values.file) {
      return;
    }
    add.mutate(
      { file: values.file, label: values.label, visible_to_employee: values.visible_to_employee },
      {
        onSuccess: () => {
          toast(t("documents.sheet.done"));
          onDone();
        },
        onError,
      },
    );
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <FileField
        control={form.control}
        name="file"
        label={t("documents.sheet.file")}
        hint={t("documents.sheet.fileHint")}
      />
      <TextField control={form.control} name="label" label={t("documents.sheet.label")} />
      <SwitchField control={form.control} name="visible_to_employee" label={t("documents.sheet.shared")} />
    </form>
  );
}
