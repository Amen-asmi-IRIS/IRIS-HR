import type { ReactNode } from "react";
import { Link } from "react-router";
import { Block, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useProfileChanges } from "@/features/profile/api";
import { useApprovals } from "@/features/requests/api";
import { DocumentStatus } from "@/features/requests/DocumentStatus";
import { Gate } from "@/features/requests/Gate";
import { openStep } from "@/features/requests/hr/actions/ActionSheet";
import { useRequestsText } from "@/features/requests/platform";
import { QUEUE_PAGE_SIZE } from "@/features/requests/queues/QueueTable";
import { describeWhen, joined } from "@/features/requests/text";
import type { ApprovalItem } from "@/features/requests/types";
import { formatDate } from "@/lib/format";

/** How many of a queue's oldest items the desk shows; the queue's page shows them all. */
const SHOWN = 3;

const requestPage = (item: ApprovalItem) => `/hr/requests/${item.request.public_id}`;

function DeskBlock({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  const { t } = useRequestsText();
  return (
    <Block
      title={title}
      action={
        <Link
          to={to}
          aria-label={t("desk.seeAll", { queue: title })}
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-body font-medium text-primary hover:underline md:min-h-0"
        >
          {t("common.seeAll")}
        </Link>
      }
    >
      {children}
    </Block>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-body text-muted-foreground">{children}</p>;
const Count = ({ children }: { children: ReactNode }) => <p className="text-body font-semibold">{children}</p>;

function Item({ to, name, children }: { to: string; name: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="-mx-2 flex min-h-11 flex-col items-start justify-center gap-1 rounded-md px-2 py-1 hover:bg-muted">
        <span className="text-body font-medium text-primary">{name}</span>
        <span className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">{children}</span>
      </Link>
    </li>
  );
}

const Items = ({ children }: { children: ReactNode }) => <ul className="mt-2 flex flex-col gap-1">{children}</ul>;

/** /hr (UI 7.1): what waits for HR, queue by queue, and the oldest thing to deal with. */
export default function HrDeskPage() {
  const { t, lang } = useRequestsText();
  const validate = useApprovals({ queue: "hr", page_size: QUEUE_PAGE_SIZE });
  const certificates = useApprovals({ queue: "certificates", page_size: QUEUE_PAGE_SIZE });
  const stuck = useApprovals({ queue: "stuck", page_size: QUEUE_PAGE_SIZE });
  const changes = useProfileChanges({ scope: "all", status: "pending" });

  // The primary action: the oldest item of the first queue that is not empty, once every queue has answered.
  const settled = !validate.isPending && !certificates.isPending && !stuck.isPending && !changes.isPending;
  const oldest = validate.data?.results[0] ?? certificates.data?.results[0] ?? stuck.data?.results[0];
  const next = !settled ? null : oldest ? requestPage(oldest) : (changes.data?.count ?? 0) > 0 ? "/hr/profile-changes" : null;

  return (
    <>
      <PageHeader
        title={t("desk.title")}
        primary={
          next ? (
            <Button asChild variant="primary">
              <Link to={next}>{t("desk.next")}</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DeskBlock title={t("desk.validate.title")} to="/hr/validate">
          <Gate query={validate}>
            {(page) =>
              page.count === 0 ? (
                <Empty>{t("desk.validate.empty")}</Empty>
              ) : (
                <>
                  <Count>{t("desk.validate.count", { n: page.count })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => (
                      <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                        <span>{joined(item.request.type.name, describeWhen(item.request, t, lang))}</span>
                        <DocumentStatus request={item.request} />
                      </Item>
                    ))}
                  </Items>
                </>
              )
            }
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.certificates.title")} to="/hr/certificates">
          <Gate query={certificates}>
            {(page) => {
              if (page.count === 0) return <Empty>{t("desk.certificates.empty")}</Empty>;
              const overdue = page.results.filter((item) => item.request.certificate?.status === "overdue").length;
              return (
                <>
                  <Count>{t("desk.certificates.count", { overdue, due: page.count - overdue })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => (
                      <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                        <span>{describeWhen(item.request, t, lang)}</span>
                        <DocumentStatus request={item.request} />
                      </Item>
                    ))}
                  </Items>
                </>
              );
            }}
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.stuck.title")} to="/hr/stuck">
          <Gate query={stuck}>
            {(page) =>
              page.count === 0 ? (
                <Empty>{t("desk.stuck.empty")}</Empty>
              ) : (
                <>
                  <Count>{t("desk.stuck.count", { n: page.count })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => {
                      const who = openStep(item.request).waitingOn.join(", ");
                      const date = item.waiting_since ? formatDate(item.waiting_since, lang) : "—";
                      return (
                        <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                          <span>{who ? t("desk.stuck.item", { who, date }) : t("desk.stuck.itemNobody", { date })}</span>
                        </Item>
                      );
                    })}
                  </Items>
                </>
              )
            }
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.profile.title")} to="/hr/profile-changes">
          <Gate query={changes}>
            {(page) => {
              const rows = page.results ?? [];
              const count = page.count ?? rows.length;
              if (count === 0) return <Empty>{t("desk.profile.empty")}</Empty>;
              return (
                <>
                  <Count>{t("desk.profile.count", { n: count })}</Count>
                  <Items>
                    {rows.slice(0, SHOWN).map((change) => (
                      <Item key={change.public_id} to="/hr/profile-changes" name={change.employee.name}>
                        <span>{t("desk.profile.item", { date: formatDate(change.created_at, lang) })}</span>
                      </Item>
                    ))}
                  </Items>
                </>
              );
            }}
          </Gate>
        </DeskBlock>
      </div>
    </>
  );
}
