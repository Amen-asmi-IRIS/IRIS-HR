import { useNavigate, useSearchParams } from "react-router";
import { NotAvailable, PageHeader, toast } from "@/components";
import { useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { RequestForm } from "./RequestForm";
import { TypeChoice } from "./TypeChoice";

/**
 * /me/requests/new : step one without `?type=`, step two with it.
 * `?start=` (and `?end=`) pre-fill the dates: the calendar sends `start`. `?date=` is still read.
 */
export default function NewRequestPage() {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const types = useRequestTypes();
  const code = search.get("type");
  const isDate = (value: string | null): value is string =>
    value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  const given = search.get("start") ?? search.get("date");
  const start = isDate(given) ? given : undefined;
  const last = search.get("end");
  const end = start && isDate(last) ? last : undefined;

  if (!code) {
    const hrefFor = (chosen: string) => {
      const next = new URLSearchParams(search);
      next.set("type", chosen);
      return `/me/requests/new?${next.toString()}`;
    };
    return (
      <>
        <PageHeader title={t("choice.title")} back="/me/requests" />
        <TypeChoice hrefFor={hrefFor} />
      </>
    );
  }

  return (
    <Gate query={types} form>
      {(all) => {
        const type = all.find((item) => item.code === code && item.is_active);
        if (!type) return <NotAvailable />;
        const formId = `new:${type.code}`;
        return (
          <>
            <PageHeader title={t("form.title", { type: type.name })} back="/me/requests/new" />
            <RequestForm
              key={formId}
              type={type}
              mode="me"
              formId={formId}
              initialDate={start}
              initialEnd={end}
              onDone={({ request, sent }) => {
                toast(t(sent ? "form.sent" : "form.saved"));
                navigate(sent ? `/me/requests/${request.public_id}` : "/me/requests");
              }}
              onCancel={() => navigate("/me/requests")}
            />
          </>
        );
      }}
    </Gate>
  );
}
