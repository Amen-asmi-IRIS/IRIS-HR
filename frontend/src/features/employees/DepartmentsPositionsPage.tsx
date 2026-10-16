import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { awayWithData } from "@/api/problem";
import {
  type Column,
  DataTable,
  EmptyState,
  FormSummary,
  PageHeader,
  StatusBadge,
  SwitchField,
  TaskSheet,
  TextField,
  toast,
  useListParams,
  useProblemForm,
} from "@/components";
import { Button } from "@/components/ui/button";

import {
  type Department,
  type Position,
  useDepartments,
  usePositions,
  useSaveDepartment,
  useSavePosition,
} from "./api";

type Kind = "departments" | "positions";
type Item = Department | Position;
interface Editing {
  kind: Kind;
  item: Item | null;
}

const KINDS: Kind[] = ["departments", "positions"];

export default function DepartmentsPositionsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation("employees");
  const { filters, setFilter } = useListParams({ view: "departments" });
  const kind: Kind = filters.view === "positions" ? "positions" : "departments";
  const departments = useDepartments();
  const positions = usePositions();
  const [editing, setEditing] = useState<Editing | null>(null);

  // The page holds the sheet's form: while the application is only away it stays, with what was typed.
  if (departments.error && !awayWithData(departments)) {
    throw departments.error;
  }
  if (positions.error && !awayWithData(positions)) {
    throw positions.error;
  }

  const state = (item: Item) => (
    <StatusBadge tone={item.is_active ? "approved" : "neutral"}>
      {t(item.is_active ? "structure.active" : "structure.inactive")}
    </StatusBadge>
  );
  const action = readOnly
    ? []
    : [
        {
          key: "action",
          header: t("structure.columns.action"),
          cell: (item: Item) => (
            <Button
              type="button"
              size="sm"
              aria-label={t("structure.editItem", { code: item.code })}
              onClick={() => setEditing({ kind, item })}
            >
              {t("structure.edit")}
            </Button>
          ),
        },
      ];
  const departmentColumns: Column<Department>[] = [
    { key: "code", header: t("structure.columns.code"), cell: (item: Department) => item.code },
    { key: "name", header: t("structure.columns.name"), cell: (item: Department) => item.name },
    { key: "employees", header: t("structure.columns.employees"), cell: (item: Department) => item.employee_count },
    { key: "state", header: t("structure.columns.state"), cell: state },
    ...action,
  ];
  const positionColumns: Column<Position>[] = [
    { key: "code", header: t("structure.columns.code"), cell: (item: Position) => item.code },
    { key: "title", header: t("structure.columns.title"), cell: (item: Position) => item.title },
    { key: "grade", header: t("structure.columns.grade"), cell: (item: Position) => item.grade },
    { key: "employees", header: t("structure.columns.employees"), cell: (item: Position) => item.employee_count },
    { key: "state", header: t("structure.columns.state"), cell: state },
    ...action,
  ];

  return (
    <>
      <PageHeader
        title={t("structure.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" type="button" onClick={() => setEditing({ kind, item: null })}>
              {t(kind === "departments" ? "structure.addDepartment" : "structure.addPosition")}
            </Button>
          )
        }
      />
      <div role="tablist" aria-label={t("structure.title")} className="mb-4 inline-flex rounded-md bg-accent p-1">
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setFilter("view", value)}
            className={`min-h-10 rounded px-4 text-body max-md:min-h-11 ${
              kind === value ? "bg-card font-semibold text-foreground" : "font-medium text-accent-foreground"
            }`}
          >
            {t(`structure.tabs.${value}`)}
          </button>
        ))}
      </div>

      {kind === "departments" ? (
        <DataTable
          columns={departmentColumns}
          rows={departments.data ?? []}
          rowKey={(item: Department) => String(item.id)}
          isLoading={departments.isPending}
          empty={<EmptyState title={t("structure.empty.departments")} />}
        />
      ) : (
        <DataTable
          columns={positionColumns}
          rows={positions.data ?? []}
          rowKey={(item: Position) => String(item.id)}
          isLoading={positions.isPending}
          empty={<EmptyState title={t("structure.empty.positions")} />}
        />
      )}
      <p className="mt-4 max-w-3xl text-caption text-muted-foreground">{t("structure.inUse")}</p>

      {editing ? <StructureSheet editing={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

interface Values {
  code: string;
  label_fr: string;
  label_en: string;
  grade: string;
  is_active: boolean;
}

function valuesOf({ kind, item }: Editing): Values {
  if (!item) {
    return { code: "", label_fr: "", label_en: "", grade: "", is_active: true };
  }
  if (kind === "departments") {
    const department = item as Department;
    return {
      code: department.code,
      label_fr: department.name_fr,
      label_en: department.name_en,
      grade: "",
      is_active: department.is_active,
    };
  }
  const position = item as Position;
  return {
    code: position.code,
    label_fr: position.title_fr,
    label_en: position.title_en,
    grade: position.grade,
    is_active: position.is_active,
  };
}

// The API names the two labels name_* for a department and title_* for a position;
// the form has one pair of inputs for both.
function toFormField(field: string): string {
  return field.replace(/^(name|title)_/, "label_");
}

function StructureSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useTranslation("employees");
  const formId = useId();
  const { kind, item } = editing;
  const isDepartment = kind === "departments";
  const saveDepartment = useSaveDepartment();
  const savePosition = useSavePosition();
  const required = t("form.required");
  const schema = z.object({
    code: z.string().trim().min(1, required),
    label_fr: z.string().trim().min(1, required),
    label_en: z.string().trim().min(1, required),
    grade: z.string().trim(),
    is_active: z.boolean(),
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesOf(editing) });
  const { onError, summary } = useProblemForm(form, { mapField: toFormField });
  const options = {
    onSuccess: () => {
      toast(t("structure.saved"));
      onClose();
    },
    onError,
  };
  const submit = form.handleSubmit((values) => {
    const state = item ? { is_active: values.is_active } : {};
    if (isDepartment) {
      const body = { code: values.code, name_fr: values.label_fr, name_en: values.label_en, ...state };
      saveDepartment.mutate({ id: item?.id, body }, options);
    } else {
      const body = {
        code: values.code,
        title_fr: values.label_fr,
        title_en: values.label_en,
        grade: values.grade,
        ...state,
      };
      savePosition.mutate({ id: item?.id, body }, options);
    }
  });

  const title = item
    ? t(isDepartment ? "structure.sheet.editDepartment" : "structure.sheet.editPosition", { code: item.code })
    : t(isDepartment ? "structure.sheet.newDepartment" : "structure.sheet.newPosition");

  return (
    <TaskSheet
      open
      onOpenChange={(open: boolean) => {
        if (!open) {
          onClose();
        }
      }}
      title={title}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("form.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
        <FormSummary problems={summary} />
        <TextField control={form.control} name="code" label={t("structure.fields.code")} />
        <TextField
          control={form.control}
          name="label_fr"
          label={t(isDepartment ? "structure.fields.name_fr" : "structure.fields.title_fr")}
        />
        <TextField
          control={form.control}
          name="label_en"
          label={t(isDepartment ? "structure.fields.name_en" : "structure.fields.title_en")}
        />
        {isDepartment ? null : (
          <TextField control={form.control} name="grade" label={t("structure.fields.grade")} />
        )}
        {item ? (
          <SwitchField control={form.control} name="is_active" label={t("structure.fields.is_active")} />
        ) : null}
      </form>
    </TaskSheet>
  );
}
