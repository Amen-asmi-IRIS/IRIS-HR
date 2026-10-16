import { useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FileField, FormSummary, TaskSheet, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useAttachFile } from "./api";
import { fileProblem } from "./form/schema";
import { useSingleFlight } from "./form/useSingleFlight";
import { useRequestsText } from "./platform";
import { byName, details, serverProblems } from "./problems";

interface AddFileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** The title of the sheet, which is also the wording of the button that opened it. */
  title: string;
  /** The label of the file input: "Medical certificate", "Proof" or "File". */
  label: string;
}

interface Values {
  file: File | null;
}

const FILE_CODES = {
  "files.too_large": "file",
  "files.type_not_allowed": "file",
  "files.content_mismatch": "file",
  "files.empty": "file",
} as const;

/** A focused task: attach one file to a request (by its owner, or by HR on the employee's behalf). */
export function AddFileSheet({ open, onOpenChange, requestId, title, label }: AddFileSheetProps) {
  const { t } = useRequestsText();
  const attach = useAttachFile();
  const form = useForm<Values>({ defaultValues: { file: null } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const [add, adding] = useSingleFlight(async (values: Values) => {
    const message = values.file ? fileProblem(values.file, t) : t("addFile.required");
    if (!values.file || message) {
      form.setError("file", { type: "client", message: message ?? t("addFile.required") });
      return;
    }
    try {
      await attach.mutateAsync({ id: requestId, file: values.file });
      toast(t("addFile.done"));
      form.reset({ file: null });
      setLoose([]);
      onOpenChange(false);
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<Values>(["file"], FILE_CODES)));
    }
  });

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="primary" aria-busy={adding} onClick={form.handleSubmit(add)}>
            {t("addFile.add")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(add)} className="flex flex-col gap-4">
        <FormSummary problems={details(loose)} />
        <FileField control={form.control} name="file" label={label} hint={t("form.fileHint")} accept=".pdf,.jpg,.jpeg,.png" />
      </form>
    </TaskSheet>
  );
}
