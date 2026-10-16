import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";

import { awayWithData } from "@/api/problem";
import {
  DateField,
  FormSummary,
  PageHeader,
  PageLoading,
  SelectField,
  TextAreaField,
  TextField,
  toast,
  useProblemForm,
} from "@/components";
import { Button } from "@/components/ui/button";

import {
  type Employee,
  type EmployeePayload,
  isFullRecord,
  useCreateEmployee,
  useDepartments,
  useEmployee,
  usePositions,
  useUpdateEmployee,
} from "./api";
import { EmployeePicker } from "./EmployeePicker";

function buildSchema(required: string) {
  const text = z.string().trim();
  const mandatory = text.min(1, required);
  return z.object({
    employee_number: mandatory,
    first_name: mandatory,
    last_name: mandatory,
    date_of_birth: z.string(),
    gender: z.string(),
    professional_email: mandatory,
    personal_email: text,
    phone: text,
    address: text,
    hire_date: z.string().min(1, required),
    contract_type: z.string().min(1, required),
    contract_start_date: z.string(),
    contract_end_date: z.string(),
    status: z.string(),
    department: z.string().min(1, required),
    position: z.string().min(1, required),
    manager: z.string(),
    emergency_contact_name: text,
    emergency_contact_phone: text,
  });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: Values = {
  employee_number: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  professional_email: "",
  personal_email: "",
  phone: "",
  address: "",
  hire_date: "",
  contract_type: "",
  contract_start_date: "",
  contract_end_date: "",
  status: "active",
  department: "",
  position: "",
  manager: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

function fromEmployee(employee: Employee): Values {
  return {
    employee_number: employee.employee_number,
    first_name: employee.first_name,
    last_name: employee.last_name,
    date_of_birth: employee.date_of_birth ?? "",
    gender: employee.gender,
    professional_email: employee.professional_email,
    personal_email: employee.personal_email,
    phone: employee.phone,
    address: employee.address,
    hire_date: employee.hire_date,
    contract_type: employee.contract_type,
    contract_start_date: employee.contract_start_date ?? "",
    contract_end_date: employee.contract_end_date ?? "",
    status: employee.status === "suspended" ? "suspended" : "active",
    department: String(employee.department.id),
    position: String(employee.position.id),
    manager: employee.manager?.public_id ?? "",
    emergency_contact_name: employee.emergency_contact_name,
    emergency_contact_phone: employee.emergency_contact_phone,
  };
}

function toPayload(values: Values, editing: boolean): EmployeePayload {
  const { status, ...rest } = values;
  return {
    ...rest,
    date_of_birth: values.date_of_birth || null,
    contract_start_date: values.contract_start_date || null,
    contract_end_date: values.contract_end_date || null,
    department: Number(values.department),
    position: Number(values.position),
    manager: values.manager || null,
    ...(editing ? { status } : {}),
  } as EmployeePayload;
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t } = useTranslation("employees");
  const navigate = useNavigate();
  const existing = useEmployee(id);
  const departments = useDepartments();
  const positions = usePositions();
  const create = useCreateEmployee();
  const update = useUpdateEmployee(id ?? "");

  const record = existing.data && isFullRecord(existing.data) ? existing.data : undefined;
  const loaded = useMemo(() => (record ? fromEmployee(record) : undefined), [record]);
  const form = useForm<Values>({
    resolver: zodResolver(buildSchema(t("form.required"))),
    defaultValues: EMPTY,
    values: loaded,
  });
  const { onError, summary } = useProblemForm(form);

  if (editing && existing.isPending) {
    return <PageLoading />;
  }
  if (editing && existing.error && !awayWithData(existing)) {
    throw existing.error;
  }

  const back = record ? `/hr/employees/${record.public_id}` : "/hr/employees";
  const submit = form.handleSubmit((values) => {
    const options = {
      onSuccess: (saved: Employee) => {
        toast(t("form.saved"));
        navigate(`/hr/employees/${saved.public_id}`);
      },
      // A problem on a field this form does not have lands in the summary above the form.
      onError,
    };
    if (editing) {
      update.mutate(toPayload(values, true), options);
    } else {
      create.mutate(toPayload(values, false), options);
    }
  });

  // A deactivated department or position is offered only to the record that already uses it.
  const departmentOptions = (departments.data ?? [])
    .filter((item) => item.is_active || String(item.id) === loaded?.department)
    .map((item) => ({ value: String(item.id), label: item.name }));
  const positionOptions = (positions.data ?? [])
    .filter((item) => item.is_active || String(item.id) === loaded?.position)
    .map((item) => ({ value: String(item.id), label: item.title }));
  const sectionClass = "grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-2";
  const legendClass = "text-section font-semibold md:col-span-2";

  return (
    <>
      <PageHeader
        title={record ? t("form.titleEdit", { name: record.name }) : t("form.titleNew")}
        back={back}
      />
      <form onSubmit={submit} noValidate className="grid max-w-4xl gap-6">
        <FormSummary problems={summary} />

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.identity")}</h2>
          <TextField control={form.control} name="employee_number" label={t("fields.employee_number")} />
          <span className="max-md:hidden" />
          <TextField control={form.control} name="first_name" label={t("fields.first_name")} />
          <TextField control={form.control} name="last_name" label={t("fields.last_name")} />
          <DateField control={form.control} name="date_of_birth" label={t("fields.date_of_birth")} />
          <SelectField
            control={form.control}
            name="gender"
            label={t("fields.gender")}
            options={[
              { value: "", label: t("gender.unspecified") },
              { value: "female", label: t("gender.female") },
              { value: "male", label: t("gender.male") },
            ]}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.contact")}</h2>
          <TextField
            control={form.control}
            name="professional_email"
            type="email"
            label={t("fields.professional_email")}
            hint={t("form.emailHint")}
          />
          <TextField control={form.control} name="personal_email" type="email" label={t("fields.personal_email")} />
          <TextField control={form.control} name="phone" label={t("fields.phone")} />
          <TextAreaField control={form.control} name="address" label={t("fields.address")} />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.contract")}</h2>
          <DateField control={form.control} name="hire_date" label={t("fields.hire_date")} />
          <SelectField
            control={form.control}
            name="contract_type"
            label={t("fields.contract_type")}
            placeholder={t("form.choose")}
            options={[
              { value: "permanent", label: t("contract.permanent") },
              { value: "fixed_term", label: t("contract.fixed_term") },
              { value: "temporary", label: t("contract.temporary") },
              { value: "consultant", label: t("contract.consultant") },
            ]}
          />
          <DateField control={form.control} name="contract_start_date" label={t("fields.contract_start_date")} />
          <DateField control={form.control} name="contract_end_date" label={t("fields.contract_end_date")} />
          {editing ? (
            <SelectField
              control={form.control}
              name="status"
              label={t("fields.status")}
              options={[
                { value: "active", label: t("status.active") },
                { value: "suspended", label: t("status.suspended") },
              ]}
            />
          ) : null}
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.organisation")}</h2>
          <SelectField
            control={form.control}
            name="department"
            label={t("fields.department")}
            placeholder={t("form.choose")}
            options={departmentOptions}
          />
          <SelectField
            control={form.control}
            name="position"
            label={t("fields.position")}
            placeholder={t("form.choose")}
            options={positionOptions}
          />
          <Controller
            control={form.control}
            name="manager"
            render={({ field, fieldState }) => (
              <EmployeePicker
                label={t("fields.manager")}
                value={field.value || null}
                onChange={(value) => field.onChange(value ?? "")}
                exclude={id ? [id] : []}
                allowNone
                noneLabel={t("form.noManager")}
                current={record?.manager}
                error={fieldState.error?.message}
              />
            )}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.emergency")}</h2>
          <TextField
            control={form.control}
            name="emergency_contact_name"
            label={t("fields.emergency_contact_name")}
          />
          <TextField
            control={form.control}
            name="emergency_contact_phone"
            label={t("fields.emergency_contact_phone")}
          />
        </section>

        <div className="flex gap-3">
          <Button variant="primary" type="submit">{t("form.save")}</Button>
          <Button variant="ghost" asChild>
            <Link to={back}>{t("form.cancel")}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
