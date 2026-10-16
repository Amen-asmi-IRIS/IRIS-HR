import { DownloadLink } from "@/components";
import type { Lang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { useRequestHistory } from "../api";
import { Gate } from "../Gate";
import { useRequestsText, type Translate } from "../platform";
import { joined } from "../text";
import type { AmendmentOut, AttachmentOut, StepOut, Unit } from "../types";

export function stepWho(step: StepOut, t: Translate): string {
  const names = step.approvers.join(", ");
  if (step.rule === "hr_role") return t("steps.who.hr");
  if (step.rule === "line_manager") return names ? t("steps.who.manager", { names }) : t("steps.who.managerNone");
  return names || t("steps.who.nobody");
}

/** "Approved by Sami Ben Ali on ...", with how the decision was given when it was recorded by HR. */
export function stepOutcome(step: StepOut, t: Translate, lang: Lang): string {
  const decided = step.status === "approved" || step.status === "rejected" || step.status === "returned";
  if (!decided) return t(`steps.status.${step.status}`);
  const outcome = t(`steps.status.${step.status}`, {
    name: step.decided_by ?? "—",
    date: step.decided_at ? formatDateTime(step.decided_at, lang) : "—",
  });
  if (!step.recorded_by || !step.channel) return outcome;
  const how = t("steps.recorded", { recorder: step.recorded_by, channel: t(`steps.channel.${step.channel}`) });
  return `${outcome} ${how}`;
}

/** Who decided what, when, with their comment. The latest sending first when there were several. */
export function StepList({ steps }: { steps: StepOut[] }) {
  const { t, lang } = useRequestsText();
  if (steps.length === 0) return <p className="text-body text-muted-foreground">{t("steps.none")}</p>;
  const rounds = [...new Set(steps.map((step) => step.round))].sort((a, b) => b - a);
  return (
    <div className="flex flex-col gap-4">
      {rounds.map((round) => (
        <section key={round}>
          {rounds.length > 1 && (
            <h3 className="text-caption font-medium text-muted-foreground">{t("steps.round", { round })}</h3>
          )}
          <ol className="mt-1 flex flex-col gap-3">
            {steps
              .filter((step) => step.round === round)
              .sort((a, b) => a.position - b.position)
              .map((step) => (
                <li key={step.id} className="text-body">
                  <p className="font-medium">
                    {stepWho(step, t)}
                    {step.amendment_public_id ? ` (${t("steps.forChange")})` : ""}
                  </p>
                  <p className="text-text-secondary">{stepOutcome(step, t, lang)}</p>
                  {step.comment && <p className="text-text-secondary">{t("steps.quoted", { text: step.comment })}</p>}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The files the viewer may see, each served as a download through the API. */
export function FileList({ attachments }: { attachments: AttachmentOut[] }) {
  const { t, lang } = useRequestsText();
  if (attachments.length === 0) return <p className="text-body text-muted-foreground">{t("view.noFiles")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((file) => (
        <li key={file.public_id} className="text-body">
          <DownloadLink
            href={`/api/v1/attachments/${file.public_id}/download`}
            download
            className="font-medium text-primary underline underline-offset-2"
          >
            {file.name}
          </DownloadLink>
          <span className="block text-caption text-muted-foreground">
            {t("files.meta", {
              kind: t(`files.kind.${file.kind}`),
              by: file.uploaded_by,
              date: formatDateTime(file.uploaded_at, lang),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AmendmentList({ amendments, unit }: { amendments: AmendmentOut[]; unit: Unit }) {
  const { t, lang } = useRequestsText();
  const amount = (value: string) => (unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  return (
    <ul className="flex flex-col gap-3">
      {amendments.map((amendment) => (
        <li key={amendment.public_id} className="text-body">
          <p className="font-medium">
            {joined(t(`view.amendmentKind.${amendment.kind}`), t(`view.amendmentStatus.${amendment.status}`))}
          </p>
          {amendment.kind === "change" && amendment.new_start_date && amendment.new_end_date && (
            <p className="text-text-secondary">
              {t("view.amendmentNew", {
                range: formatDateRange(amendment.new_start_date, amendment.new_end_date, lang),
                quantity: amendment.new_quantity ? amount(amendment.new_quantity) : "",
              })}
            </p>
          )}
          {amendment.reason && (
            <p className="text-text-secondary">{t("view.amendmentReason", { reason: amendment.reason })}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The full history, already filtered by the server for this viewer. */
export function HistoryList({ id }: { id: string }) {
  const { t, lang } = useRequestsText();
  const history = useRequestHistory(id);
  return (
    // It sits in a request page that may have a sheet open: an outage keeps what it shows.
    <Gate query={history} form>
      {(items) =>
        items.length === 0 ? (
          <p className="text-body text-muted-foreground">{t("view.historyEmpty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, index) => (
              <li key={`${item.at}-${index}`} className="text-body">
                <span className="block text-caption text-muted-foreground">
                  {joined(formatDateTime(item.at, lang), item.actor ?? t("view.system"))}
                </span>
                {item.summary}
              </li>
            ))}
          </ol>
        )
      }
    </Gate>
  );
}
