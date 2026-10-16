import { useNavigate, useSearchParams } from "react-router";
import { backToList, NotAvailable, PageHeader, toast } from "@/components";
import { useEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { useRequestTypes } from "../api";
import { RequestForm } from "../form/RequestForm";
import { TypeChoice } from "../form/TypeChoice";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";

const NEW = "/hr/requests/new";

/**
 * /hr/requests/new (UI 7.7): the form of a new request, preceded by the choice of the employee.
 * The address carries the progress, so the browser's Back button goes one choice back.
 */
export default function HrNewRequestPage() {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const employeeId = search.get("employee");

  if (!employeeId) {
    return (
      <>
        <PageHeader title={t("hrNew.title")} back={backToList("/hr/requests")} />
        <div className="max-w-md rounded-xl border border-border bg-card px-6 py-5">
          <EmployeePicker
            label={t("hrNew.employee")}
            hint={t("hrNew.employeeHint")}
            value={null}
            onChange={(publicId) => {
              if (publicId) setSearch({ employee: publicId });
            }}
          />
        </div>
      </>
    );
  }
  return <ForEmployee employeeId={employeeId} code={search.get("type")} />;
}

function ForEmployee({ employeeId, code }: { employeeId: string; code: string | null }) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const employee = useEmployee(employeeId);
  const types = useRequestTypes();
  const chooseType = `${NEW}?employee=${encodeURIComponent(employeeId)}`;

  return (
    <Gate query={employee} form>
      {(person) =>
        code === null ? (
          <>
            <PageHeader title={t("hrNew.titleFor", { name: person.name })} back={NEW} />
            <TypeChoice hrefFor={(chosen) => `${chooseType}&type=${chosen}`} />
          </>
        ) : (
          <Gate query={types} form>
            {(all) => {
              const type = all.find((item) => item.code === code && item.is_active);
              if (!type) return <NotAvailable />;
              const formId = `hr:${employeeId}:${type.code}`;
              return (
                <>
                  <PageHeader title={t("hrNew.formTitle", { type: type.name, name: person.name })} back={chooseType} />
                  <RequestForm
                    key={formId}
                    type={type}
                    mode="hr"
                    formId={formId}
                    employeeId={employeeId}
                    onDone={({ request, sent }) => {
                      toast(t(sent ? "form.sent" : "form.saved"));
                      navigate(sent ? `/hr/requests/${request.public_id}` : "/hr/requests");
                    }}
                    onCancel={() => navigate("/hr/requests")}
                  />
                </>
              );
            }}
          </Gate>
        )
      }
    </Gate>
  );
}
