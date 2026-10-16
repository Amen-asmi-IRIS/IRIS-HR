import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Block, Figure, PageHeader, PageLoading } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays } from "@/lib/format";

import { useMeHome, type NeedsYouItem } from "./api";
import { RequestLines } from "./RequestLines";

const ACTION_LINK = "inline-flex min-h-11 items-center text-body font-medium text-primary hover:underline md:min-h-0";
const QUIET = "text-body text-muted-foreground";

function NeedsYou({ items }: { items: NeedsYouItem[] }) {
  const { t } = useTranslation("home");
  const lang = useLang();
  return (
    <ul className="divide-y divide-divider">
      {items.map((item) => (
        <li key={`${item.kind}-${item.request.public_id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          {item.kind === "returned" ? (
            <>
              <div>
                <p className="text-body text-foreground">
                  {t("me.needsYou.returned", {
                    type: item.request.type.name,
                    dates: formatDateRange(item.request.start_date, item.request.end_date, lang),
                  })}
                </p>
                {item.request.state.note ? <p className={QUIET}>{item.request.state.note}</p> : null}
              </div>
              <Link to={`/me/requests/${item.request.public_id}/edit`} className={ACTION_LINK}>{t("me.needsYou.edit")}</Link>
            </>
          ) : (
            <>
              <p className="text-body text-foreground">
                {t("me.needsYou.certificate", { deadline: item.due_at ? formatDateTime(item.due_at, lang) : "" })}
              </p>
              <Link to={`/requests/${item.request.public_id}`} className={ACTION_LINK}>{t("me.needsYou.addCertificate")}</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MeHomePage() {
  const { t } = useTranslation("home");
  const lang = useLang();
  const home = useMeHome();
  if (home.isPending) {
    return <PageLoading />;
  }
  if (home.error) {
    throw home.error;
  }
  const data = home.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("me.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("me.newRequest")}</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title={t("me.balance.title")}
               action={<Link to="/me/balance" className={ACTION_LINK}>{t("me.balance.details")}</Link>}>
          <Figure label={t("me.balance.label")} value={formatDays(data.balance.current, lang)} />
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-caption text-muted-foreground">{t("me.balance.pending")}</dt>
              <dd className="text-body font-semibold tabular-nums text-foreground">{formatDays(data.balance.pending, lang)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{t("me.balance.upcoming")}</dt>
              <dd className="text-body font-semibold tabular-nums text-foreground">{formatDays(data.balance.approved_upcoming, lang)}</dd>
            </div>
          </dl>
        </Block>

        {data.needs_you.length > 0 ? (
          <Block title={t("me.needsYou.title")}>
            <NeedsYou items={data.needs_you} />
          </Block>
        ) : null}

        <Block title={t("me.inProgress.title")}>
          {data.in_progress.length > 0
            ? <RequestLines requests={data.in_progress} show="status" />
            : <p className={QUIET}>{t("me.inProgress.empty")}</p>}
        </Block>

        <Block title={t("me.comingUp.title")}>
          {data.coming_up.length > 0
            ? <RequestLines requests={data.coming_up} show="quantity" />
            : <p className={QUIET}>{t("me.comingUp.empty")}</p>}
        </Block>
      </div>
    </div>
  );
}
