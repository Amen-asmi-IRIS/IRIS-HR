import { Link, Navigate, useNavigate, useParams } from "react-router";
import { EmptyState, PageHeader, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequest, useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { RequestForm } from "./RequestForm";

interface EditRequestPageProps {
  /** The workspace the page is mounted in: "me" for one's own request, "hr" for a draft HR entered. */
  mode?: "me" | "hr";
}

/** /<workspace>/requests/:id/edit : the form of Task 5, opened on an existing request. */
export default function EditRequestPage({ mode = "me" }: EditRequestPageProps) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const request = useRequest(id);
  const types = useRequestTypes();
  const requestPage = `/${mode}/requests/${id}`;

  return (
    <Gate query={request} form>
      {(current) => (
        <Gate query={types} form>
          {(all) => {
            if (!current.viewer.actions.includes("edit")) return <Navigate to={requestPage} replace />;
            const type = all.find((item) => item.code === current.type.code);
            if (!type) {
              return (
                <EmptyState
                  title={t("edit.typeGone")}
                  hint={t("edit.typeGoneHint")}
                  action={
                    <Button asChild variant="secondary">
                      <Link to={requestPage}>{t("edit.backToRequest")}</Link>
                    </Button>
                  }
                />
              );
            }
            const formId = `edit:${current.public_id}`;
            const who = current.state.last_actor ?? t("edit.someone");
            return (
              <>
                <PageHeader title={t("edit.title", { type: current.type.name })} back={requestPage} />
                {current.status === "returned" && (
                  <p role="status" className="mb-4 rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
                    {current.state.note
                      ? t("edit.returnedBy", { who, note: current.state.note })
                      : t("edit.returnedByNoNote", { who })}
                  </p>
                )}
                <RequestForm
                  key={formId}
                  type={type}
                  mode={mode}
                  formId={formId}
                  existing={current}
                  employeeId={mode === "hr" ? current.employee.public_id : undefined}
                  onDone={({ request: saved, sent }) => {
                    const message = current.status === "pending" ? "form.changed" : sent ? "form.sent" : "form.saved";
                    toast(t(message));
                    navigate(sent ? `/${mode}/requests/${saved.public_id}` : `/${mode}/requests`);
                  }}
                  onCancel={() => navigate(requestPage)}
                />
              </>
            );
          }}
        </Gate>
      )}
    </Gate>
  );
}
