import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
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
import { type Employee, useMyEmployee } from "@/features/employees/api";

import { type NewProfileChange, useProposeProfileChange } from "./api";

const PROFILE = "/me/profile";

/** The fields an employee may propose (master 7.7); the API refuses any other. */
const FIELDS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "gender",
  "personal_email",
  "phone",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

function buildSchema(required: string) {
  const text = z.string().trim();
  return z.object({
    first_name: text.min(1, required),
    last_name: text.min(1, required),
    date_of_birth: z.string(),
    gender: z.string(),
    personal_email: text,
    phone: text,
    address: text,
    emergency_contact_name: text,
    emergency_contact_phone: text,
    note: text,
  });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: Values = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  personal_email: "",
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  note: "",
};

function fromEmployee(employee: Employee): Values {
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    date_of_birth: employee.date_of_birth ?? "",
    gender: employee.gender,
    personal_email: employee.personal_email,
    phone: employee.phone,
    address: employee.address,
    emergency_contact_name: employee.emergency_contact_name,
    emergency_contact_phone: employee.emergency_contact_phone,
    note: "",
  };
}

/** Only what differs from the record is proposed. An emptied date is sent as null. */
function changedFields(before: Values, after: Values): NewProfileChange["changes"] {
  const changes: Record<string, string | null> = {};
  for (const name of FIELDS) {
    if (after[name] !== before[name]) {
      changes[name] = name === "date_of_birth" && after[name] === "" ? null : after[name];
    }
  }
  return changes as NewProfileChange["changes"];
}

/** The API names a refused value "changes.<field>"; the input is called "<field>". */
function toFormField(field: string): string {
  return field.startsWith("changes.") ? field.slice("changes.".length) : field;
}

/** My space, Propose a change: the personal fields with their current values (UI 5.9). */
export default function ProposeChangePage() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const employee = useMyEmployee();
  const propose = useProposeProfileChange();
  const [nothing, setNothing] = useState(false);

  const loaded = useMemo(() => (employee.data ? fromEmployee(employee.data) : undefined), [employee.data]);
  const form = useForm<Values>({
    resolver: zodResolver(buildSchema(t("change.required"))),
    defaultValues: EMPTY,
    values: loaded,
  });
  const { onError, summary, clear } = useProblemForm(form, { mapField: toFormField });

  if (employee.isPending) {
    return <PageLoading />;
  }
  // While the application is only away the form stays, with what was typed (master 13.1).
  if (employee.error && !awayWithData(employee)) {
    throw employee.error;
  }

  const submit = form.handleSubmit((values) => {
    if (!loaded) {
      return;
    }
    const changes = changedFields(loaded, values);
    clear();
    if (Object.keys(changes).length === 0) {
      setNothing(true);
      return;
    }
    setNothing(false);
    propose.mutate(
      { changes, note: values.note },
      {
        onSuccess: () => {
          toast(t("change.sent"));
          navigate(PROFILE);
        },
        // A refused value appears next to its input; anything else (a proposal already waiting,
        // an outage) appears above the form. What was typed stays.
        onError,
      },
    );
  });

  const sectionClass = "grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-2";
  const legendClass = "text-section font-semibold md:col-span-2";

  return (
    <>
      <PageHeader title={t("change.title")} back={PROFILE}>
        {t("change.rule")}
      </PageHeader>
      <form onSubmit={submit} noValidate className="grid max-w-4xl gap-6">
        <FormSummary problems={nothing ? [t("change.nothing")] : summary} />

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.identity")}</h2>
          <TextField control={form.control} name="first_name" label={t("employees:fields.first_name")} />
          <TextField control={form.control} name="last_name" label={t("employees:fields.last_name")} />
          <DateField control={form.control} name="date_of_birth" label={t("employees:fields.date_of_birth")} />
          <SelectField
            control={form.control}
            name="gender"
            label={t("employees:fields.gender")}
            options={[
              { value: "", label: t("employees:gender.unspecified") },
              { value: "female", label: t("employees:gender.female") },
              { value: "male", label: t("employees:gender.male") },
            ]}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.contact")}</h2>
          <TextField
            control={form.control}
            name="personal_email"
            type="email"
            label={t("employees:fields.personal_email")}
          />
          <TextField control={form.control} name="phone" label={t("employees:fields.phone")} />
          <TextAreaField control={form.control} name="address" label={t("employees:fields.address")} />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.emergency")}</h2>
          <TextField
            control={form.control}
            name="emergency_contact_name"
            label={t("employees:fields.emergency_contact_name")}
          />
          <TextField
            control={form.control}
            name="emergency_contact_phone"
            label={t("employees:fields.emergency_contact_phone")}
          />
        </section>

        <TextAreaField control={form.control} name="note" label={t("change.note")} />

        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            {t("change.submit")}
          </Button>
          <Button variant="ghost" asChild>
            <Link to={PROFILE}>{t("change.cancel")}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
