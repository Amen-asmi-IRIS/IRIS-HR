import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ProblemError } from "@/api/problem";
import { Block, Disclosure, PageHeader, PageLoading, Pager, StatusBadge, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/api";
import { useMyEmployee } from "@/features/employees/api";
import { DocumentList } from "@/features/employees/DocumentList";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useProfileChanges, useWithdrawProfileChange } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";

const PAGE_SIZE = 25;

type PersonalField =
  | "first_name"
  | "last_name"
  | "date_of_birth"
  | "gender"
  | "personal_email"
  | "phone"
  | "address"
  | "emergency_contact_name"
  | "emergency_contact_phone";

/** One section of the profile: labels and values, two per row from a tablet up. */
function Details({ title, rows }: { title: string; rows: [label: string, value: string][] }) {
  return (
    <Block title={title}>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="m-0 break-words text-body font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

/** What a proposal asks for: one line per field, from the old value to the new one. */
function ChangeLines({ change }: { change: ProfileChange }) {
  const { t } = useTranslation("profile");
  const text = useChangeText();
  return (
    <ul className="grid gap-1 text-body">
      {change.changes.map((item) => (
        <li key={item.field}>
          {t("changeLine", {
            field: text.label(item.field),
            old: text.value(item.field, item.old),
            new: text.value(item.field, item.new),
          })}
        </li>
      ))}
    </ul>
  );
}

/** The proposals that are no longer waiting, the most recent first, with the answer of HR. */
function PastProposals() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const list = useProfileChanges({ scope: "mine", status: "decided", page });
  const rows = list.data?.results ?? [];

  if (list.isPending) {
    return <p role="status">{t("loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("proposals.empty")}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-divider">
        {rows.map((row) => (
          <li key={row.public_id} className="grid gap-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">
                {t("proposals.sent", { date: formatDateTime(row.created_at, lang) })}
              </p>
              <OutcomeBadge status={row.status} />
            </div>
            <ChangeLines change={row} />
            {row.comment ? <p className="text-body">{t("proposals.comment", { comment: row.comment })}</p> : null}
          </li>
        ))}
      </ul>
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}

/** My space, Profile: my own record, read-only. Changes go through a proposal that HR decides (UI 5.8). */
export default function MyProfilePage() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const me = useCurrentUser();
  const text = useChangeText();
  const employee = useMyEmployee();
  const waiting = useProfileChanges({ scope: "mine", status: "pending" });
  // Kept by the page, not by the block it serves: the block leaves the page once the proposal is
  // withdrawn, and callbacks given to `mutate` are dropped once their component is gone.
  const withdraw = useWithdrawProfileChange();

  if (employee.isPending || waiting.isPending) {
    return <PageLoading />;
  }
  if (employee.isError) {
    // An account without an employee record has no profile: the shell shows "not available".
    throw employee.error;
  }
  if (waiting.isError) {
    throw waiting.error;
  }

  const record = employee.data;
  const pending = waiting.data.results[0] ?? null;
  const personal = (field: PersonalField): [string, string] => [text.label(field), text.value(field, record[field])];

  const sendWithdrawal = () => {
    if (!pending || withdraw.isPending) {
      return;
    }
    withdraw.mutate(pending.public_id, {
      onSuccess: () => toast(t("pending.withdrawn")),
      onError: (error: unknown) => toast(error instanceof ProblemError ? error.detail : t("pending.failed")),
    });
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          pending ? undefined : (
            <Button variant="primary" asChild>
              <Link to="/me/profile/change">{t("propose")}</Link>
            </Button>
          )
        }
      />

      {pending ? (
        <div className="mb-4">
          <Block
            title={t("pending.title")}
            action={<StatusBadge tone="waiting">{t("outcome.pending")}</StatusBadge>}
          >
            <p className="mb-2 text-caption text-muted-foreground">
              {t("pending.sent", { date: formatDateTime(pending.created_at, lang) })}
            </p>
            <ChangeLines change={pending} />
            <div className="mt-4">
              <Button type="button" onClick={sendWithdrawal} aria-busy={withdraw.isPending}>
                {t("pending.withdraw")}
              </Button>
            </div>
          </Block>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Details
          title={t("sections.identity")}
          rows={[personal("first_name"), personal("last_name"), personal("date_of_birth"), personal("gender")]}
        />
        <Details
          title={t("sections.contact")}
          rows={[
            [text.label("professional_email"), record.professional_email],
            personal("personal_email"),
            personal("phone"),
            personal("address"),
          ]}
        />
        <Details
          title={t("sections.emergency")}
          rows={[personal("emergency_contact_name"), personal("emergency_contact_phone")]}
        />
        <Details
          title={t("sections.work")}
          rows={[
            [text.label("department"), record.department.name],
            [text.label("position"), record.position.title],
            [text.label("manager"), record.manager?.name ?? t("employees:facts.noManager")],
          ]}
        />
      </div>

      <div className="mt-6 grid gap-3">
        <Disclosure title={t("blocks.documents")}>
          <DocumentList employeeId={record.public_id} sharing="hide" />
        </Disclosure>
        <Disclosure title={t("blocks.proposals")}>
          <PastProposals />
        </Disclosure>
        <Disclosure title={t("blocks.signin")}>
          <p className="text-body">
            {me.previous_login_at
              ? t("signin.previous", { date: formatDateTime(me.previous_login_at, lang) })
              : t("signin.first")}
          </p>
        </Disclosure>
      </div>
    </>
  );
}
